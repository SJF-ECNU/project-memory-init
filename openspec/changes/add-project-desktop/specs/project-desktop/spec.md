## ADDED Requirements

### Requirement: Project selection
The application SHALL let the user select a local project directory and switch between previously selected projects without writing project files.
#### Scenario: Select and restore projects
- **WHEN** a user selects a project and restarts the application
- **THEN** the project is available for selection and its current Markdown files are scanned

### Requirement: Category navigation
The application SHALL display nonempty content categories in the sidebar and matching files as central cards, without a category named 项目记忆.
#### Scenario: Select agent rules
- **WHEN** the user selects CLAUDE.md
- **THEN** only matching files from the selected project appear with their relative paths

### Requirement: Cards and reading
The application SHALL show each file title, path, source-derived excerpt and labeled modification date, and safely render its Markdown on selection.
#### Scenario: Return to browsing
- **WHEN** the user opens a card and returns
- **THEN** the prior category, query and scroll position are restored

### Requirement: Search and refresh
The application SHALL support searching titles, paths and text, sorting by modification date or name, and explicitly refreshing project files.
#### Scenario: Changed checkout content
- **WHEN** project files change and the user refreshes
- **THEN** the visible content reflects the files currently present

### Requirement: Local read boundary
The application SHALL read Markdown, UTF-8 text and dotfiles only inside selected projects, skip symbolic links and dependency folders, and keep filesystem access outside the renderer.
#### Scenario: Linked external folder
- **WHEN** a selected project contains a symbolic link to an external folder
- **THEN** its contents are excluded from scanning
#### Scenario: Unsafe Markdown
- **WHEN** a file contains scripts or remote media
- **THEN** scripts do not execute and remote media does not load

### Requirement: Stable browsing chrome and transitions
The application SHALL keep browsing titles and search/sort controls aligned across categories, use short content/view transitions, and respect reduced-motion preferences.
#### Scenario: Category switch
- **WHEN** the user switches content categories at the same window size
- **THEN** the title and search/sort controls retain their vertical anchors while only results transition
#### Scenario: Reduced motion
- **WHEN** the system requests reduced motion
- **THEN** content/view transitions and decorative animations are disabled

### Requirement: Visible update chronology
The application SHALL show local-calendar time groups with counts and complete modification dates when sorting by update time, and omit time groups for name sorting.
#### Scenario: Read chronology
- **WHEN** files have timestamps today, yesterday, within the last seven calendar days or older
- **THEN** they appear in labeled nonempty groups, with older files grouped by month and complete dates on cards
#### Scenario: Name sorting
- **WHEN** the user selects name sorting outside the recent view
- **THEN** time grouping is omitted and files retain name order
