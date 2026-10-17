# Examples

Every `*.json` file here is a scenario. It appears in the top bar and has a short link: `…/#file-name`.
Add a file, rebuild, done; no code changes.

How to make one:

1. Build the network in the Sandbox, then **Share → Download file**.
2. Save it here as `my-name.json`.
3. Add a `scenario` block next to `devices` / `links` / `positions`:

```json
"scenario": {
  "title": "8. My example",
  "group": "example",
  "order": 20,
  "description": "One or two sentences shown above the picture.",
  "goal": "What the student should notice.",
  "hideHints": false,
  "suggestions": [
    { "label": "PC1 → Server",
      "action": { "type": "send", "from": "pc1", "app": "client", "dstIp": "10.0.0.5", "dstPort": 80, "message": "GET /" },
      "expect": { "delivered": true } }
  ]
}
```

- `group`: `tour` (numbered buttons), `fix` (troubleshooting menu, usually with `"hideHints": true`) or `example` (the Examples menu).
- `order`: position within the lists. `expect` is checked by the tests (`npm test`).
- A name instead of an IP works with `"dstIp": "", "dstName": "www.example.org"`; a DHCP request is `{ "type": "dhcp", "from": "pc1" }`.
