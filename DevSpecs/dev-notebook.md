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

# 