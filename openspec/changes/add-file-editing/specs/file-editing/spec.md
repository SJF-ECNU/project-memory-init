## ADDED Requirements
### Requirement: Basic text editing
The desktop SHALL browse and edit existing UTF-8 .md, .txt and dotfiles inside selected projects.
#### Scenario: Save edits
- **WHEN** the user edits and saves a file
- **THEN** the original file and its displayed content are updated
#### Scenario: Plain text
- **WHEN** a .txt file contains Markdown or HTML syntax
- **THEN** reading displays literal text without interpreting that syntax
### Requirement: Safe saves and unsaved drafts
The desktop SHALL reject writes outside selected projects, symbolic links, unsupported files and externally changed content, and preserve drafts when saving fails.
#### Scenario: External modification
- **WHEN** another program changes a file after the editor opened it
- **THEN** saving fails without replacing that external change and retains the draft
#### Scenario: Leave unsaved work
- **WHEN** the user navigates away or closes the window with unsaved changes
- **THEN** they can keep editing or discard the changes explicitly
