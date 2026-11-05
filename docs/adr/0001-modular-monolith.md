# 1. Modular monolith with a separate worker

**Status:** accepted

The API is one Express service, split into modules with routes, services and owner-scoped queries.
Background work runs in a separate worker. The API is stateless, so scaling means adding instances.
Rate limits live in Redis, so they hold across instances.

**Why not microservices:** there are no users yet, and one deployable is far cheaper to run and change.
Module boundaries keep a later split possible if a real bottleneck ever justifies it.
