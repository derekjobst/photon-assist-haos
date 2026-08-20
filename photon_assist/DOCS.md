# Photon Assist

This app routes allowed inbound iMessage direct and human-created group messages
from Photon Spectrum Cloud to a Home Assistant conversation agent and replies
in the same thread.

## Requirements

- A Photon Spectrum Cloud project with an active iMessage line.
- Home Assistant OS on `amd64` or `aarch64`.
- The Home Assistant conversation agent configured in `agent_id`. The default
  is `conversation.claude`.

The app supports existing group conversations, but it does not create or manage
groups. Photon requires a dedicated line for those operations. A reply in a
group is visible to every participant, so only use groups whose members may see
Home Assistant's responses.

## Configuration

| Option | Meaning |
| --- | --- |
| `spectrum_project_id` | Required Photon Spectrum project ID. |
| `spectrum_project_secret` | Required Photon Spectrum project secret. It is masked in the app UI. |
| `allowed_senders` | Required list of allowed E.164 telephone numbers. In a group, this authorizes the sender of a message; it does not verify every group participant. |
| `language` | Language sent to the Conversation API, normally `en`. |
| `agent_id` | Conversation agent entity ID, default `conversation.claude`. |
| `conversation_ttl_minutes` | Per-DM Assist context retention; default 24 hours. |
| `message_retention_days` | Duplicate-message retention; default 7 days. |
| `max_message_chars` | Longest accepted input; default 4,000 characters. |
| `log_level` | `debug`, `info`, `warning`, or `error`. Normal logs never include message text, sender IDs, or secrets. |

The app has no exposed network ports. It calls Home Assistant internally using
the Supervisor-provided `SUPERVISOR_TOKEN` at
`http://supervisor/core/api/conversation/process`.

## Behavior and recovery

- Inbound messages are serialized per iMessage conversation so conversation IDs cannot
  race.
- A persisted message ID is claimed before Assist is called. This favors safe
  non-duplication of home-control requests if the app crashes at an unlucky
  time.
- Once an allowed message has been claimed, the app marks it read, then
  shows a typing indicator while Assist runs. A read-receipt failure never
  blocks Assist.
- A stored conversation ID is cleared and retried once only when Home Assistant
  clearly reports that the supplied conversation ID is invalid. Network,
  timeout, and server failures are never retried automatically.
- Replies are sent as Markdown, which Spectrum renders as native styled text
  in remote iMessage mode.

## Troubleshooting

- A startup error about configuration generally means an empty or malformed
  setting. Sender values must be E.164, for example `+15551234567`.
- If the app starts but messages do not arrive, verify the Spectrum project has
  an active cloud iMessage line and that the sender is listed exactly in
  `allowed_senders`.
- If Assist is unavailable, the app sends a generic retry message and logs the
  failure category without private content.
