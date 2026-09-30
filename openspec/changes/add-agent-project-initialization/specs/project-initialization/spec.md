## ADDED Requirements

### Requirement: Local agent selection
The application SHALL detect locally installed Claude and Codex and let the user choose an available agent for the selected project.
#### Scenario: Missing executable
- **WHEN** a CLI cannot be found or its version probe fails
- **THEN** its option is unavailable and the user sees installation guidance

### Requirement: Scoped initialization
The application SHALL invoke only a supported CLI in the selected project with the bundled initialization Skill, preserving existing project content and using no shell interpolation.
#### Scenario: Project directory contains spaces
- **WHEN** a user starts initialization in a selected directory whose name contains spaces
- **THEN** the CLI receives that exact working directory and the complete Skill on stdin
#### Scenario: Unsupported input
- **WHEN** a caller supplies an unknown agent or unselected project
- **THEN** execution is rejected before spawning a process

### Requirement: Progress and lifecycle
The application SHALL display live output and final status, allow cancellation, and prevent overlapping initialization jobs.
#### Scenario: Cancellation
- **WHEN** a user stops an active job
- **THEN** its child processes are terminated and the UI reports that existing writes are retained
#### Scenario: View changes
- **WHEN** the user navigates or switches projects while a job is active
- **THEN** the job remains tied to its original project and the execution panel can be reopened

### Requirement: Evidence of completion
The application SHALL refresh files on completion and distinguish missing outputs or CLI errors from a successful initialization.
#### Scenario: Zero exit without files
- **WHEN** the agent exits normally but necessary entry files are missing
- **THEN** the UI reports incomplete initialization with missing paths
#### Scenario: Authentication failure
- **WHEN** a CLI returns an authentication or permission failure
- **THEN** the UI displays the failure and offers retry after the user fixes their local CLI

### Requirement: Per-run model selection
The application SHALL offer models from the installed Codex catalog and apply the user selection only to the initialization process, without changing global configuration.
#### Scenario: Incompatible configured default
- **WHEN** the user chooses a listed Codex model
- **THEN** the CLI receives that model explicitly and the job records the choice
#### Scenario: Invalid model argument
- **WHEN** a caller supplies a model containing command arguments
- **THEN** execution is rejected before spawning

### Requirement: Upstream retry visibility
The application SHALL display Claude API retry events without exposing credentials and retain permission warnings when auxiliary restrictions are recovered.
#### Scenario: Service retry
- **WHEN** Claude reports an API retry with an HTTP status
- **THEN** the panel shows the retry status and directs the user to check their local forwarding service or provider
#### Scenario: Recovered auxiliary denial
- **WHEN** a tool is denied but the agent exits successfully without a terminal error and all required outputs exist
- **THEN** the UI reports generated entries with a permission warning and prompts content review
- **AND** a terminal permission failure or missing entry remains failed

### Requirement: Leave initialization view
The application SHALL return to file browsing when the user clicks a content category, changes projects, presses Escape in the initialization view, or uses the return button, without cancelling an active initialization job.
#### Scenario: Category navigation
- **WHEN** the user selects a content category while the initialization panel is open
- **THEN** the panel closes and the selected category files are displayed
#### Scenario: Return while running
- **WHEN** the user leaves an active initialization view
- **THEN** the job continues and can be reopened from the initialization entry
