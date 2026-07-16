# hftr v2

- we are taking the core of hftr v1 and creating version 2 of it.
- hftr (version 1) is not functional, however it's build contains information and vast amounts of research and resources which we want to use in the version 2, which should be functional.  Our goal is to use hftr as a conceptual inspiration and blueprint for version 2.
- version 2 should include:
 - a cleaner user interface built from the ground up
 - functional research modules
 - functional backend trading functions and logic as defined by the version 1 processing pipeline with optimizations and clean architecture

# Primary updates:

## SIMPLIFIED AUTH + PAYMENT
- use clerk for auth
- use stype for payment; allow for easy one click amounts for seeds in companies.


## SIMPLIFIED UI
- Each company has a canvas view background
- shows each module as a node, with relevant connections; from left ot right - research modules -> data modules (data libraries and live API) -> trading modules -> trading policies

- details for each node will be shown in PANELS that extend from the left, bottom, and right sides.  these are full screen panels, but they should appear from their given side and collapse back accordingly.
- each node should also have a simplified view of it's info.
- each canvas node has an expanded info view of what it is doing 

### LEFT PANEL: research + data sources + trends
- tab views for research, data sources 
- all research module progress and topics and wikis and documentation
- view available data sources, ability to create new ones
- 

### MIDDLE BOTTOM:  exploration + analysis + choice
- this will be the interface for viewing which stocks or trades are actually being made.  dynamic view for seeing how trends are translated into trading policies, which are then turned into to actual trade decisions.
- this is really the main control panel for the system.
- this interface will display data structures and watchlists, and will be scoped by creation node; however should also be able to show when other nodes are editing or analyzing it, as many data structures will the shared and read amongst nodes.

### RIGHT: EXECUTION + verification + simulation results
- this is where we view ledger of all trades made, all results, all responses made
- this is also where we view the results of all simulated runs

## UPDATED LLM MODEL USAGE
- we will use Mistral as our mid model (from three tier system)
- this will provide the bulk of analysis and orchestration and will be the main middleware engine that will delegate to claude, and then be processed downstream by groq for direct formatting/execution and verification.
- we need to ensure the pipeline is built carefully, with every layer according to the processing model we've laid out and best practices.  respect rate limiting via limiting of initial calls rather than token or data truncation; specific input and output schemas and as specific as possible pipeline steps as possible for idempotent functionality at low level execution levels as possible
- use research on stock market and trade execution to create deterministic control palattes for trade actions; our goal is to have llm's mainly generate choices of options rather than full token assessments, so this will require progressively disclosed options of 

## INTERNAL COMPANY STRUCTURE
- user will be able to create COMPANIES
- each company can consist of one or more trading modules, and additional modules (research, data)
- each company will begin with a seed amount; user allocates specific amounts of funds to each trading module (or can set to auto)
- each company sets policies for trading goals, re-investment strategies, and other scoping policies for all included modules.


## MODULES
- these are the full set of nodes that a user can create multiple instances of per-company
- canvases will be pre-seeded with all (user-defined) company-wide data and funds and philsophy sources 

modules within a company can:
- request for additional funds allocations from the main company
- borrow from each other's profits; requires user approval (or user can set to auto)


### SCOPED RESEARCH MODULES
- these are autonomous agents that build and curated connected tagged databases
- we need to be able to have robust standardized visualization of research and connected concepts etc.; think of a 3d connected galaxy map that shows neural connections between tagged related concepts and ideas.  we need to research best practices for being able to display different data types, and flexibly allow for all possible according to info being shown.
- separate from data modules: these are dynamically opinionated agent modules, they are opportunistic and curious and seek new sources of data


### DATA MODULES
- these manage live data feeds from various sources (either via api); should be mainly deterministic modules that provide eyes/ears for agents.
- the idea of the data modules is that they hydrate actual numbers to the execution and analysis pipeline 

#### LIBRARIES

- these are curated knowledge-bases hydrated by one or more research modules
- these are created per-company and can be shared across multiple output sources
- they provide indexed tagged formatted optimized information about specific topics or events or historical data or any other relevant information that the research modules find
- these can be scoped to market data, other external history and political information, or any other type of information data that has been documented and deemed to be relevant for a given library.
- these libraries should be scoped by topic, but should also be built to reference each other (basically individually scoped libaries should still be subsets of a master library) to allow for displaying connections between different articles
- would ideally like to be able to view/export this info as markdown files (in addition to whatever is needed for system views);  should be able to download obsidian-optimized folders of .md files of all libraries

#### LIVE APIs
- these are live data sources
- they will provide the actual live numbers for specific data requests
- they specifically deliver live data and can be queried by the pipeline.
- rather than relying on llm connectors, this will provide us with actual discrete sources of data for each execution and analysis cycle.


### TREND MODULES
- these provide the link between live api data + research modules, the company philosophy and trading policies, and the actual executions made by the trading modules 
- the trend modules curate lists of trends, and linked research to provide both directives and completion verification and all necessary curation and updating based on new data.
- this essentially is the engine that provides the directives for all downstream trading actions
- can decide to run simulations


### SCOPED TRADING MODULES

- each of these modules will be custom built to be optimized for their specific expertise.
- they have 
- user can add multiple trading modules to a COMPANY, which will dictate overall goals and be the primary pot of money that all included modules will seed from.
- each trading module is defined by a seed amount, desired exit timeline length, and then can be attached to data modules and research modules.
- modules in a company can be linked to share resources while maintaining separate execution policies and scopes.
- these trading modules have the full internal verification loop built into them.

#### CRYPTO

- specialized in crypto markets and watching trends across multiple areas and caps and volumes.

#### PREDICION MARKETS (polymarket, kalshi, etc.)

- specialized in finding niche data sources for high confidence bets, and for quick order execution etc.

#### HIGH FREQUENCY TRADING

- this will leverage swarms of micro trades across multiple sectors in order to maintain stability.  makes use of auto-research and live market data most heavily

#### DAY TRADING

- functions like a personalized day trader
- focused on regular small gains and following day trading stratgies

#### LONG TERM TRADING

- specializes in long term trading strategies and maintaining a specific desired balance of stability and liquidity, combining possible one-time trends and other market data to take advantage of long term trends for highest gains.

### UTILITY

#### module generator
- this takes input and according to user specs can create any number of additional modules of any type.  basically catch all custom modules creator.

#### simulator
- trading module paper runs; allows for multiple parallel
- user can set results to feed into a 

#### analyzer
- basically a catch all converter for any data inputs into any data outputs.
- can serve as verification and loop information back into a trend or research module etc., can also serve as a converter from different market data sources into trends, etc. must automatically understand how to morph analysis calls according to different input data.

#### fund router 
- allows user to take percentage or certain subset of funds from a trading module and send them to another module or fund reserve; flexibly route funds from asset-generating nodes

## BUILT IN ASSISTANT
- this will be a mistral-run chat bot like interface that has access to currently viewed company, and can make targeted edits to set up based on user input.
- assistant must be optimized for direct edits with extremely specific json schema and full hardened edit functions via the user input.  research best practices and iplement.

## NUMBER HANDLING
- we need to make sure that all agents are forced to use a built in calculator function for any number or calculation related queries, AND that the data pipeline for this number is straight from an actual live data source, and then straight into an actual set variable saved k/v field.

- this should likely be viewable as a math module, but it needs to provide both static and flexible discrete calculation abilities for llms to use and in order to allow agents to interact with funds pipelines.

- so prompts and agents need to be built in a way that they control calculator function and decisions based on number deltas, but never actually handle direct numbers.
- the idea is that llm can have influence on control of a system and general direction, but never handles any actual number handling.  number handling pipeline has to be straight from data sources and existing best practices policies all the way to executions.  again every step of possible number morphability has to be deterministically checked for sanity.

# Process Notes:

- you must find ALL specific pipeline and modules from the old version's DevSpecs, agent-docs, and actual implementations.  there is ample research and details and preferences and specifications in the old version, so make sure every single bit of information is analyzed for validity and possible integration into the new version.
- many concepts in the new version integrate with old ones, so look for ways to connect the two rather than just blindly adding new features.



# v2 deployment notes
- will deploy to a new vercel project, or connect to existing.
- research necessary front and backend dependencies.  we can re-use old databases if necessary, v2 will replace v1 in all deployed cases.

# Workspace curation

- ensure full workspace awareness is seeded into the cursor workspace rules, workflows, skills, etc. according to best practices.
- establish design, ui/ux, and visual styling universal standards for the project and ensure agent is aware.
- ensure that all DevSpecs and v1 folders remain both READ-ONLY and the canonical initial reference point for the project.  All build processes going forward must align with the complete intent from both the v2 DevSpecs, AND the original hftr v1 project.
- ensure that all agent rules + skills + workflows encourage **SELF CURATION** and update with full user input and developer intent and all research, analysis, planning, product specs, implementation progress and notes, verification, testing, error fixing/debugging, and deployment standards and strategies that are considered and eventually decided on.
- ensure best practices for architecture, code quality and standards are established and maintained in all execution, according to the requirements of the application.
- encourage external research and verification of all claims in code and documentation, establish zero-trust of written code and implementations without verification, and ensure that testing protocols are established according to high level developer intent.