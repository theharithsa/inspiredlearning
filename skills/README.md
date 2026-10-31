# InspiredLearning agent guidance

Deployment update (31 October): app 2.2.2 / Functions 2.0.2 is live from `298cc4f`; see [release evidence](../../docs/RELEASE-2.2.2.md). The audit below is historical; broader visual and native RUM acceptance gates remain open.

| Skill | Use for |
| --- | --- |
| [inspiredlearning-api-privacy](inspiredlearning-api-privacy/SKILL.md) | Domain contracts, shared identity, credits, certificates, removal and permissions |
| [inspiredlearning-observability](inspiredlearning-observability/SKILL.md) | RUM, OTel, canonical outbox, health/redrive, GitHub delivery, provider deployment capture/replay and tenant verification |
| [inspiredlearning-release](inspiredlearning-release/SKILL.md) | Issue/PR delivery, emulator checks, source/release evidence and scoped deployment gates |

These are concise app-specific adaptations of the installed app-launchpad workflow (27 October 2026) and dt-obs v1.2.0. They are self-contained through repository docs and actual commands; no machine-specific skill paths, secrets or historical approvals are imported. The untracked portable skill copy in workshop-reference is outside this repository's ownership.

V2 implementation guidance:

- [inspiredlearning-material3](inspiredlearning-material3/SKILL.md): official Material controls, approved violet palettes, fourteen local fonts, adaptive navigation, keyboard/focus and synthetic visual evidence.
- [inspiredlearning-admin-auth](inspiredlearning-admin-auth/SKILL.md): separate entries/session persistence, bootstrap/role checks and recent authentication.

These app-specific skills describe implemented source, while production provisioning/configuration and live verification remain separate gates.
