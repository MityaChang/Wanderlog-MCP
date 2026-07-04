export const WANDERLOG_SERVER_INSTRUCTIONS = `Use Wanderlog tools to build complete, practical trip plans.

When creating a trip, call wanderlog_create_trip first. Then use
wanderlog_search_places for real candidates before calling wanderlog_add_place.
Use wanderlog_search_guides and wanderlog_get_guide for public Wanderlog guide
inspiration before drafting an itinerary, or to inspect one guide day.
Interleave wanderlog_add_note calls for transit, booking details, timing, and
local context. Add lodging with wanderlog_add_hotel when requested. Add a
pre-trip checklist or day checklist with wanderlog_add_checklist for documents,
tickets, currency, offline maps, reservations, and day-specific tasks.

The add, update, delete, and expense tools operate on local drafts stored in
a user-local JSON file. Local drafts are not yet live Wanderlog writes.
Use wanderlog_list_drafts to inspect the current draft state and
wanderlog_export_drafts to serialize it for review or handoff.

Organize itineraries by day. Interleave places with practical notes instead of
returning a flat list of pins. Ask for clarification before deleting or editing
when a natural-language reference matches multiple items.`;
