# 5. Offline writes limited to occurrence actions

**Status:** accepted

Only complete, skip and reopen work offline, as the blueprint's operation contract specifies. They are the
frequent actions, and server rules resolve them deterministically. Planner editing needs a connection.

The queue is ordered by a strictly increasing value, expected versions chain across queued actions, and a
server reply never overwrites a newer queued change. IndexedDB is not encrypted: the data never leaves the
user's own device, logout wipes it, and browser storage encryption would need a key stored beside the data.
