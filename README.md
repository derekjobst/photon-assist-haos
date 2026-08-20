# Photon Assist Home Assistant App

Photon Assist is a Home Assistant OS app that relays direct messages and
human-created group messages received through a managed Photon Spectrum iMessage
line to Home Assistant Assist.

It accepts text from configured E.164 senders, calls the configured Home
Assistant conversation agent through the internal Supervisor proxy, and replies
to the original iMessage with native iMessage Markdown formatting.

## Security model

- No inbound HTTP port or public webhook is exposed. The app consumes
  Spectrum's authenticated `app.messages` stream.
- Only inbound iMessage DMs and group messages from `allowed_senders` are
  processed. Attachments, reactions, and outbound messages are ignored.
- A group reply is visible to every participant in that group. Only add the
  app to groups whose members may see Home Assistant's responses; the app
  authorizes the message sender, not every member of the group.
- The app uses the short-lived `SUPERVISOR_TOKEN` supplied by Home Assistant;
  it does not store a Home Assistant token.
- Conversation state and a retained inbound-message ID ledger live in `/data`.
  The ledger prevents a duplicate delivery from executing Assist twice.
- Message bodies, sender identifiers, and credentials are never written to
  normal logs.

## Installation

1. Create a Spectrum Cloud project and obtain its project ID and secret. The
   add the app's line to a group that a human creates. The app does not create
   or manage groups; Photon requires a dedicated line for those operations.
2. The release workflow publishes the matching multi-architecture image to
   GHCR. Make that package public once so Home Assistant can pull it.
3. In Home Assistant, add this repository as a custom app repository and
   install **Photon Assist**.
4. Configure the project credentials and one or more permitted E.164 sender
   numbers. The default agent is `conversation.claude`.

See [the app documentation](photon_assist/DOCS.md) for all settings.

Every push to `main` creates the next patch release, updates the app manifest,
creates an annotated `vX.Y.Z` tag, and publishes matching `amd64` and `arm64`
images to GHCR. The package must be made public once in GitHub Packages before
Home Assistant can pull it anonymously.

## Development

```sh
cd photon_assist
npm ci
npm test
npm run check
```
