# MODULE STORE

- divide nodes by category

## Templates

- create insert-able templates for end to end trading engines; these will require certain settings to be defined by user (sector focus, actual amount caps, dropdown/option selectable trading philosophies etc.), but should function end to end.

- create templates for each type of trade module (crypto, prediction, high frequency, day trade, etc.); they will be mainly defined by their trade module and all verification loops and analysis and training loops they spawn.

These templates will require specific data inputs and can be hydrated from libraries or directly from research or other data modules.

# COMPANY CREATION
- must give discrete options for adding seed modules
- each module should have a funds allocation (amount or percentage), a topic/sector focus (dropdown options to add + custom entered) as well as a target exit date/time.



# DEFAULT SEEDED TRADING ENGINES

- this will be created based on initial user selection of which engines they want to include in company creation.

- names of all nodes need to be default according to actual specific functions.

- adding new trading engines should require same user entered info from company creation dialogue

- do not seed topics or sectors of engines, just seed construction and logic.

## BASIC TRADE ENGINE

[RESEARCH MODULES]
|
[DATA MODULES] 
└─ Market + Runtime History Data
└─ Library Data
└─ Live APIs
| |
| [TREND MODULES]
| |
[TRADING MODULE]
└─
└─
└─ fund source -> Math Module -> fund router
|
[POLICY VERIFICATION MODULES]
└─> transaction execution monitor
└─> trading policy


# JUSTIFICATION POP UPS

- any element that is decided by an LLM decision or touched by llm needs to have a pop up on hover that shows the full justification for that action.

# GALAXY VIEW


---

within the galaxy view, we need to organize things at an even smaller level.  within folders (which should each have their own spheres), articles should form their own orbits with all included tags and concepts included within them as the individual objects.

mass is equal to most amalgamation of baseline definitions for a center of a folder star, and positioning is based on actual semantic similarities, distance by calculated similarity.  continue to refine implementation of this.

---

also improve the display of the markdown formatting in the inspector

---


# RUNTIME RESEARCH

## USER

- user can submit research articles (links or raw text)
- user can also submit raw text directives that will be added to "philosophy" - not agent-editable, but folded into company (or module) philosophy.

## AGENT
- this is where the research agent will put new research articles (regardless of connection in system, this is full documentation record of all research)
- articles are a part of collections, collections are organized into shelves.
- articles can include concepts, tags, trends, symbols; they can be added to existing libraries.
- agent can create new libraries to organize research.
- agent can include existing libraries as a part of their custom created libraries
- 

# RESEARCH AND LIBRARIES:

- libraries should be organized into discrete articles
- articles can contain any combinations:  concepts, tags, trends, functions (formulas or transformations) symbols, and fields/KV lists either set or open ended.
- all articles must be tagged with creation date and most recent refresh date, in addition to record dates of all other common actions.


---
# current market positioning tab
add a tab to the left panel for "current market trends":  this will be main viewing interface for baseline system top movers, company/engine/trend persisted watch list symbols, and basically all current market data and a specially curated analysis of how it fits into current context and how our positions relate.

this should be at least validated and possibly updated whenever large new trends are followed etc.

this also will be the hub for viewing analysis of actual positions (vs. libraries which are an async external research process).  this hub will show all current positions and what plans are for their continuation and or exit.

change current "research" to "research + libraries".

this market posture view should show a list of all current open positions as well as all other company-wide persisted categories as it's main content.  top should show currrent equity chart (dynamically updates based on which position is selected), and top movers in sector, along with navigation trigger buttons for current reports etc.

also has to show a dashboard like interface (similar to the galaxy panel), with higher granularity of detail of holdings and market data.

each position has to show chips for the engines that are presiding over it.