# Next Obsidian plugin release

## Added

## Changed

- Scale file-buffer budgets to device RAM: 20% on desktop and 10% on mobile when available. Uploads retain their memory reservation until the server confirms the changes, and files larger than the budget are processed individually.

- Apply downloaded files in related groups and release their buffers promptly. Servers that report file sizes use memory-aware download admission; older servers retain parallel downloads. Oversized groups run on their own.

## Fixed

- Prevent files with incompatible paths from being uploaded, and identify blocked local files in the file explorer and blocked local or remote files in sync settings so they can be renamed safely. Preserve existing local files when a blocked remote rename would otherwise let another file overwrite them.
