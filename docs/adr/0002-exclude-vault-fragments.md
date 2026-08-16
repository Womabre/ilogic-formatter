# Exclude iLogic Vault fragments from the curated set

The fragment library the curated set was drawn from was roughly half
`iLogicVault` — the API of a third-party Vault add-in rather than core iLogic —
and those fragments carried vendor documentation prose copied verbatim. None of
it is shipped. Two reasons, either sufficient on its own: the snippets only work
for users who have that add-in installed, so for most of the audience they are
noise in the completion list rather than coverage; and the provenance of the
copied prose is unclear, which is not a question to hand to a maintainer
reviewing a contribution to an MIT-licensed repository.

## Consequences

Vault users get nothing from this extension. If that is worth fixing, the clean
shape is a separate opt-in pack with its own provenance story and its own
setting — not fragments merged into the core set, where they would dilute
completions for everyone else.
