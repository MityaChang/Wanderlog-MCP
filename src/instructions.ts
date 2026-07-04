export const WANDERLOG_SERVER_INSTRUCTIONS = `Use Wanderlog tools to build complete, practical trip plans.

When creating a trip, call wanderlog_create_trip first. Then use
wanderlog_search_places for real candidates before calling wanderlog_add_place.
Interleave wanderlog_add_note calls for transit, booking details, timing, and
local context. Add lodging with wanderlog_add_hotel when requested. Add a
pre-trip checklist or day checklist with wanderlog_add_checklist for documents,
tickets, currency, offline maps, reservations, and day-specific tasks.

Organize itineraries by day. Interleave places with practical notes instead of
returning a flat list of pins. Ask for clarification before deleting or editing
when a natural-language reference matches multiple items.`;
