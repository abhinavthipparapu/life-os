# 4. Occurrences are immutable history with an event log

**Status:** accepted

Each scheduled instance is a row keyed by `(task, slot, date)`, and every state change adds a `task_events`
row. Schedule edits regenerate only future instances that are untouched. Deferring closes the original as
not-applicable and creates a new occurrence, so history is never rewritten.

Adherence excludes skipped, rest and not-applicable rows, and also today's unfinished tasks, which are not
misses until the day has passed. A period with nothing eligible has no score. It is not zero.
