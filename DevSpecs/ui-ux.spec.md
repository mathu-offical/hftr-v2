# UI / UX SPECS:

## TOP APP SHELL RIBBON

- [dropdown menu] Company navigation
- info ticker tape with all recent executions
- master switch between paper trading and real accounts

### USER SETTINGS
- modal triggered by button in top app shell
- API key entry (peristed per user)

### TOP DRAWER

- slides down from top app shell ribbon
- tab views:  company ledger/PnL, trading profile, settings, philosophy

---

## MAIN CANVAS AREA

- main background for interface; all other panels layer on top of this canvas
- laid out from left to right, with sequential operations going from left to right
- each node takes inputs for data + context (left edge), system control (top edge); it has access to tools/other modules for reference and interaction via it's bottom edge, and then outputs data from it's right edge.
- must intelligently handle loops

- we will seed an initial basic functional setup for each new company based on how the system is designed to work.
- these node set ups will be flexible, but we need to only allow connections that are actually possible.  make this easy to use and feel dynamic but make sure functions are set and scoped to only what is actually allowed and processable.

### NODES
- each node accepts input on it's left edge, and outputs on it's right edge.
- top edge is for system control, bottom edge is for tools and module usage
- each connection point is colored based on the data type it accepts or outputs.
- each node should allow for inline dropdown for changing it's model and viewing it's internal elements/settings.
- note groups:  these are similar nodes that are linked together and share context and outputs; they require a shared output schema.
- add ALL nodes from the init.spec.md

#### RESEARCH MODULES

- these will each have specific scopes


#### DATA MODULES
- libraries and api's - data sources for the system.
- live data APIs
- research data libraries:  organized research topics
- external market data history libraries:  
- runtime market data history libraries
- runtime application log libraries


#### TREND MODULES

- each curates an integrated trend list with a specific focus
- outputs to multiple trading modules to execute multiple trades related to a trend
- each trend module is set to a specific expertise or combination of expertises (in terms of scope/trading module type AND field specialty etc.)

#### TRADING MODULES
- performs actual executions
- takes inputs from trend modules and perform actual
- outputs reports that can be sent back to data and research modules or analyzed etc. or looped back to a previous point.

#### UTILITY MODULES

- simulation
- funds routing
- holding fund
- analysis:  past, current, or future focused
- math module:  calculator function that must be attached to llm-powered nodes in order for them to perform calculations or morph funding decisions.  these calculators can also be persisted with specific calculations optimized in order to further lock in the deterministic nature of them.

#### DISPLAY NODES
- these will be flexible set of graphs, lists, tables, ledgers, and other visual elements to display data or exectuions and other parts of the system.

### CONNECTIONS

- these show flow between nodes.
- should be colored according to type
- should have resting and active states (animation for active, and specific animation when data is ACTUALLY sent)

#### CONTROL BUS

- lines which represent delivery of system control
- these connect to the TOP of nodes

#### DATA 

- lines which represent transfer of context information
- these feed from 

#### FUNDS

- lines which represent actual movement of funds
- can originate from funds sources, and must 
- these can only be processed from funds sources, and via math modules

---

## LEFT PANEL

- tab interface
- each tab allows for viewing of each nodes curation space; the tab view should allow the user to select individual nodes or node groups to view in the panel.

### RESEARCH

- dynamic 3d galaxy view that snaps to be able to view connections and tags
- traditional page views of information as well
- different views based on scope; 
- interface to create new research modules with specific scope or focus

### DATA SOURCES
- organized according to source, shows which nodes they hydrate
- live api's
- libraries
- interface to manually add more

---

## BOTTOM PANEL

- tab views
- each view has a selector for the specific node or node group to be viewed, and shows only that group; each view aggregates all system objects affected by the selected nodes/group.

### TRENDS
- view trend lists
- each trend list is curated by a trend module
- ability to manually edit or create new trend lists; buttons to re-analyze or integrate

### SCENARIO ENGINE
- this is a view of ALL trend-linked scenarios generated.
- it shows both the active the trading modules AND any paper simulations run
- this is a way to see how trends are being decomposed into actual trade actions

### WATCH LISTS
- these are symbols being watched with all biases or notes.
- this is way to view all confirmed watched stocks or items per trading module.

### DECISION MATRICES + TRACES
- conglomerated view of all actual decisions being made
- ability to view any potential execution and trace the full decision process/morph thru the system; basically every morph or mutation should emit some kind of specified indication of it's effect in order to optimize full viewing and tracing.

---

## RIGHT PANEL

### VERIFICATION
- all actions submitted for verification and status
- notifications for blocked and re-routed etc.
- full viewing of any verification

### EXECUTIONS
- this is a list of ALL actual actions executed and any affects they had.

### LEDGER

- table of all profits and losses; static and dynamic views

### SIMULATION
- results of all simulated runs, and all analysis