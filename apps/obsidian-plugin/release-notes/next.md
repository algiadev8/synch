# Next Obsidian plugin release

## Added

- Added a conflict policy setting: keep a conflict copy (default), or prefer the remote version without saving a copy of conflicting local changes. Automatic Markdown merging is still attempted first.

## Changed

- Organization members can connect to vaults without separate assignments. Encryption key approval is still required; existing passwords and connections are preserved.

- Moved Disconnect to the Sync row, before Start/Stop sync, and removed the separate vault connection row. Sign out appears after disconnecting the vault.

- Redesigned vault sharing with connection status and clear empty states, focused on approving member access requests. Personal access and password setup remain in Connect vault.

- Show vault sharing controls in settings only for active Plus subscriptions or self-hosted servers.
- Removed the vault password change option from the plugin.
- Removed redundant permission explanations from invitation and sharing screens.

## Fixed

- Fixed vault approval requests failing with an invalid secret ID error in Obsidian.
