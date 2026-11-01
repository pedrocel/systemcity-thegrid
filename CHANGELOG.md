# Changelog

All notable changes to the community edition. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] · 2026-11-01

First public release.

### Added
- 3D city engine (Three.js r128, no build step): districts, stations, detours, external systems, workers walking the flows, labels, walk and drive modes, presentation tour.
- City generated from a GitHub repository by Claude, ready-made templates (e-commerce, fintech, SaaS) and hand-written cities.
- Live mode through `bridge/`: HTTP polling, SSE, WebSocket, webhooks and MCP servers.
- Accounts, teams with roles, invitations by nickname.
- Meetings: presence, chat, scheduling, WebRTC voice and video, live captions, AI-written minutes whose action items become construction sites in the city.
- Incidents with a war room and an AI post-mortem; incident webhooks.
- The Grid: multiplayer motorbike race for stand-ups, with voice, scoring, seasons and achievements; touch controls.
- Replay of the last 48 h, ask-the-city chat, corridor talk with spatial audio.
- AI cost attribution per person and kind of work, admin dashboard, optional per-plan limits.
- Docker image and compose file, server tests, Playwright browser tests, CI, CodeQL and Dependabot.

[1.0.0]: https://github.com/pedrocel/systemcity-thegrid/releases/tag/v1.0.0
