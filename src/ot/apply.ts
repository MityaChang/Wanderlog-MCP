export type Json0Path = Array<string | number>;

export type Json0Op = {
  p: Json0Path;
  li?: unknown;
  ld?: unknown;
  lm?: number;
  oi?: unknown;
  od?: unknown;
  si?: string;
  sd?: string;
  na?: number;
  r?: unknown;
  t?: string;
  o?: unknown;
};

type JsonContainer = Record<string, unknown> | unknown[];

export function applyJson0<T>(document: T, ops: Json0Op[]): T {
  const next = structuredClone(document) as JsonContainer;

  for (const op of ops) {
    applySingleOp(next, op);
  }

  return next as T;
}

function applySingleOp(document: JsonContainer, op: Json0Op): void {
  if (op.p.length === 0) {
    throwPathError(op.p, "op path must not be empty");
  }

  if (op.t !== undefined) {
    applySubtypeOp(document, op);
    return;
  }

  if (op.r !== undefined) {
    replaceValue(document, op.p, op.r);
    return;
  }

  if (op.na !== undefined) {
    addNumber(document, op.p, op.na);
    return;
  }

  if (op.si !== undefined || op.sd !== undefined) {
    updateString(document, op);
    return;
  }

  if (op.li !== undefined || op.ld !== undefined || op.lm !== undefined) {
    updateList(document, op);
    return;
  }

  if (op.oi !== undefined || op.od !== undefined) {
    updateObject(document, op);
  }
}

function applySubtypeOp(document: JsonContainer, op: Json0Op): void {
  if (op.t !== "rich-text") {
    return;
  }

  const parent = parentAt(document, op.p);
  const key = lastPathPart(op.p);
  const current = getOptionalValue(parent, key, op.p) ?? {
    ops: [{ insert: "" }],
  };
  const text = extractRichText(current, op.p);
  const nextText = applyRichTextDelta(text, op.o, op.p);
  setValue(parent, key, { ops: [{ insert: nextText }] }, op.p);
}

function getOptionalValue(
  container: JsonContainer,
  key: string | number,
  path: Json0Path,
): unknown {
  if (Array.isArray(container)) {
    return valueAt(container, key, path);
  }
  if (typeof key !== "string") {
    throwPathError(path, "object path part must be a string");
  }
  return container[key];
}

function extractRichText(value: unknown, path: Json0Path): string {
  if (!isRecord(value) || !Array.isArray(value.ops)) {
    throwPathError(path, "rich-text target is not a delta");
  }

  return value.ops
    .map((deltaOp) => {
      if (!isRecord(deltaOp) || typeof deltaOp.insert !== "string") {
        return "";
      }
      return deltaOp.insert;
    })
    .join("");
}

function applyRichTextDelta(
  text: string,
  delta: unknown,
  path: Json0Path,
): string {
  if (!Array.isArray(delta)) {
    throwPathError(path, "rich-text op body must be an array");
  }

  let offset = 0;
  let next = text;

  for (const deltaOp of delta) {
    if (!isRecord(deltaOp)) {
      throwPathError(path, "rich-text delta op must be an object");
    }
    if (typeof deltaOp.retain === "number") {
      offset += deltaOp.retain;
    }
    if (typeof deltaOp.delete === "number") {
      next = next.slice(0, offset) + next.slice(offset + deltaOp.delete);
    }
    if (typeof deltaOp.insert === "string") {
      next = next.slice(0, offset) + deltaOp.insert + next.slice(offset);
      offset += deltaOp.insert.length;
    }
  }

  return next;
}

function updateList(document: JsonContainer, op: Json0Op): void {
  const parent = parentAt(document, op.p);
  const key = lastPathPart(op.p);

  if (!Array.isArray(parent)) {
    throwPathError(op.p, "list op parent is not an array");
  }
  if (typeof key !== "number") {
    throwPathError(op.p, "list op requires numeric final path part");
  }

  if (op.lm !== undefined) {
    if (key < 0 || key >= parent.length) {
      throwPathError(op.p, `list move source ${key} is out of bounds`);
    }
    if (op.lm < 0 || op.lm >= parent.length) {
      throwPathError(op.p, `list move target ${op.lm} is out of bounds`);
    }
    const [item] = parent.splice(key, 1);
    parent.splice(op.lm, 0, item);
    return;
  }

  if (op.ld !== undefined) {
    if (key < 0 || key >= parent.length) {
      throwPathError(op.p, `list delete index ${key} is out of bounds`);
    }
    if (JSON.stringify(parent[key]) !== JSON.stringify(op.ld)) {
      throwPathError(op.p, "list delete value does not match current value");
    }
    parent.splice(key, 1);
  }

  if (op.li !== undefined) {
    if (key < 0 || key > parent.length) {
      throwPathError(op.p, `list insert index ${key} is out of bounds`);
    }
    parent.splice(key, 0, op.li);
  }
}

function updateObject(document: JsonContainer, op: Json0Op): void {
  const parent = parentAt(document, op.p);
  const key = lastPathPart(op.p);

  if (!isRecord(parent)) {
    throwPathError(op.p, "object op parent is not an object");
  }
  if (typeof key !== "string") {
    throwPathError(op.p, "object op requires string final path part");
  }

  if (op.od !== undefined) {
    if (!(key in parent)) {
      throwPathError(op.p, `object delete key ${key} is missing`);
    }
    if (JSON.stringify(parent[key]) !== JSON.stringify(op.od)) {
      throwPathError(op.p, "object delete value does not match current value");
    }
    delete parent[key];
  }

  if (op.oi !== undefined) {
    parent[key] = op.oi;
  }
}

function replaceValue(
  document: JsonContainer,
  path: Json0Path,
  replacement: unknown,
): void {
  const parent = parentAt(document, path);
  const key = lastPathPart(path);

  if (Array.isArray(parent)) {
    if (typeof key !== "number") {
      throwPathError(path, "replace on array requires numeric final path part");
    }
    if (key < 0 || key >= parent.length) {
      throwPathError(path, `replace index ${key} is out of bounds`);
    }
    parent[key] = replacement;
    return;
  }

  if (typeof key !== "string") {
    throwPathError(path, "replace on object requires string final path part");
  }
  parent[key] = replacement;
}

function addNumber(
  document: JsonContainer,
  path: Json0Path,
  amount: number,
): void {
  const parent = parentAt(document, path);
  const key = lastPathPart(path);
  const current = valueAt(parent, key, path);

  if (typeof current !== "number") {
    throwPathError(path, `numeric add target is ${typeof current}`);
  }
  setValue(parent, key, current + amount, path);
}

function updateString(document: JsonContainer, op: Json0Op): void {
  const index = lastPathPart(op.p);
  if (typeof index !== "number") {
    throwPathError(op.p, "string op requires numeric final path part");
  }

  const stringPath = op.p.slice(0, -1);
  const parent = parentAt(document, stringPath);
  const key = lastPathPart(stringPath);
  const current = valueAt(parent, key, op.p);

  if (typeof current !== "string") {
    throwPathError(op.p, `string op target is ${typeof current}`);
  }
  if (index < 0 || index > current.length) {
    throwPathError(op.p, `string index ${index} is out of bounds`);
  }

  let next = current;
  if (op.sd !== undefined) {
    if (current.slice(index, index + op.sd.length) !== op.sd) {
      throwPathError(op.p, "string delete value does not match current value");
    }
    next = next.slice(0, index) + next.slice(index + op.sd.length);
  }
  if (op.si !== undefined) {
    next = next.slice(0, index) + op.si + next.slice(index);
  }

  setValue(parent, key, next, op.p);
}

function parentAt(document: JsonContainer, path: Json0Path): JsonContainer {
  let current: unknown = document;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    current = valueAt(current, key, path);

    if (!isRecord(current) && !Array.isArray(current)) {
      throwPathError(path, `parent at position ${index} is not a container`);
    }
  }

  if (!isRecord(current) && !Array.isArray(current)) {
    throwPathError(path, "target parent is not a container");
  }

  return current;
}

function valueAt(
  container: unknown,
  key: string | number | undefined,
  path: Json0Path,
): unknown {
  if (key === undefined) {
    throwPathError(path, "path is incomplete");
  }

  if (Array.isArray(container)) {
    if (typeof key !== "number") {
      throwPathError(path, "array path part must be numeric");
    }
    if (key < 0 || key >= container.length) {
      throwPathError(path, `array index ${key} is out of bounds`);
    }
    return container[key];
  }

  if (isRecord(container)) {
    if (typeof key !== "string") {
      throwPathError(path, "object path part must be a string");
    }
    if (!(key in container)) {
      throwPathError(path, `object key ${key} is missing`);
    }
    return container[key];
  }

  throwPathError(path, "cannot navigate through a primitive value");
}

function setValue(
  container: JsonContainer,
  key: string | number,
  value: unknown,
  path: Json0Path,
): void {
  if (Array.isArray(container)) {
    if (typeof key !== "number") {
      throwPathError(path, "array assignment requires numeric key");
    }
    container[key] = value;
    return;
  }

  if (typeof key !== "string") {
    throwPathError(path, "object assignment requires string key");
  }
  container[key] = value;
}

function lastPathPart(path: Json0Path): string | number {
  const key = path[path.length - 1];
  if (key === undefined) {
    throwPathError(path, "path is incomplete");
  }
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwPathError(path: Json0Path, reason: string): never {
  throw new Error(
    `JSON0 op path ${JSON.stringify(path)} is invalid: ${reason}.`,
  );
}
