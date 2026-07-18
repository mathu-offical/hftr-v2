# Libraries


## COMPILE TIME SEEDED LIBRARIES
- this should be the baseline stock trading mechanisms
- these should be defined, user read-able libraries of information
-

## Runtime curated libraries
- these are seeded for specific agents (research) or created run time; can be referenced/queried by agents as well
- librarian agents that are free (not part of engines) in company can decide to create new organizations of libraries; libraries can be flexibly created

- these are added to and curated by the research modules.

## SYSTEM CURATED LIBRARIES
- these are company scoped, automatically updated on daily schedule and based on live data inputs when available.
- things like top movers, general current event trends to watch.  they provide basic daily knowledge base and context

let's continue adding more additional system seeded FOLDERS/organizations of documents.

mainly for the system curated runtime:
- execution action logs
- daily summaries (these are created before market open with enough time for analysis, updated/appended/curated midday, and updated/appended/curated at market close, and once again post any additional analysis)
- policies created at run time
- trend lists 
- probably others so investigate regular system curated reports.
- sector daily news bulletins- these aggregate sector-focused news logs for entire days.
---

in general we have to improve all articles contents.

we have to improve links and ensure full use of the linking and tagging and nested library systems for full connected awareness.  research how vector databases work, and we are creating a basic version of that in order to guide relevance.  it really will be a weighted neural network based on our custom definition of relations (based on sector and news analysis).


### COMPANY-WIDE LIBRARIES
- these are company records and research related directly to the company and company philosophy
- includes all company ledgers and action history etc., full range of information relevant to company's function

### SECTOR-SCOPED LIBRARIES
- specific knoweledge related to specific sectors, organized according to actual knowledge-base

### TREND LIBRARIES
- new and current trends, based on research and also performance of existing trends 

### POLICY LIBRARIES
- these are the lists of policies generated run time based on execution etc.
- they can be scoped according to their sources, but can also be shared in a company.

---

# Research Modules
- these nodes will allow for flexible tool usage
- these research modules run on their own schedule, which have default but user can set.
- research happens independently of other processes, just updates knowledge-bases
- all need to have a two step process which both opportunistically discovers information, and then critically verifies and sanity checks against relevant existing information sources; all types need to have this double process.

## EXTERNAL RESEARCH Agents
- each curates libraries specific to the functions of the 
- these search the web, and 

## LIBRARIAN Agents
- these are modules that QUERY existing library resources, and curate and sanity/relevance check them.
- these provide relevance scores across multiple metrics to all resources and libraries.
- they are referenced 

## Live API
- 


# UI / UX

# research view updates:

research agents create "topics" that are composed of new and linked info from various databases within the company space and seeded knowledgebase and externally gathered knowledge.

- topics should be shown left panel with full rotating galaxy of info tags displayed in layered panel over main content area; clicking on a topic should open that topics trace in the galaxy and focus it.

- this galaxy will be organized according to library membership (smaller sub circles within the full company), and be able to zoom in and out and re-organize based on user selected filters and selections in the UI.

- there should also be a full info view that opens in this canvas area (tab view with galaxy) that shows more traditional wiki article with inline links and semantic text and descriptions.

---

update agent-docs as necessary to capture all detailed specs