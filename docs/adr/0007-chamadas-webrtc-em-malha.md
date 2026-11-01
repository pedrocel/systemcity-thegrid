# 0007 · WebRTC mesh calls with signalling over the app socket

**Status:** accepted

## Context
Teams want voice and video while they walk the city and during the race. Typical calls have 2 to 8 people. Running a media server (SFU) is the biggest operational cost of most meeting products.

## Decision
Calls are a full mesh of `RTCPeerConnection`s between browsers. Offers, answers and ICE candidates travel over the same WebSocket that already carries presence and chat, scoped to the room. Captions are produced in each browser for its own microphone and only the text is sent.

## Consequences
- No media server to run or pay for; audio and video never touch our servers.
- Upload bandwidth grows with the number of participants, so mesh suits small groups. Larger calls need an SFU, which can be added behind the same signalling messages.
- Calls need HTTPS (browsers only grant camera and microphone on secure origins).
