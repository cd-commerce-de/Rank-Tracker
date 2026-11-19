// ---------- Config ----------
const FLAGS = { DE: "🇩🇪", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", AT: "🇦🇹", NL: "🇳🇱", PL: "🇵🇱" };
const MP_LABEL = { ebay: "eBay", otto: "Otto", kaufland: "Kaufland", temu: "Temu" };
const MP_ORDER = ["ebay", "otto", "kaufland", "temu"];
const MP_SITE = {   // the storefront each marketplace is read from, shown in the marketplace dropdown
  ebay: { domain: "ebay.de", url: "https://www.ebay.de" }, otto: { domain: "otto.de", url: "https://www.otto.de" },
  kaufland: { domain: "kaufland.de", url: "https://www.kaufland.de" }, temu: { domain: "temu.com", url: "https://www.temu.com/de" },
};
const MP_LOGO = { ebay: "assets/marketplaces/ebay.png", kaufland: "assets/marketplaces/kaufland.png", temu: "assets/marketplaces/temu.png" };
let MP_BOUND = false;

let ALL_ROWS = [];
let IS_DEMO = false;
let PROJECTS = {};   // project_id -> { project_id, project_name, items: { item_key: {...} }, rows: [] }
let SETTINGS = {};   // docs/settings.json
const APP_VERSION = "2026-11-20.2";   // must equal the scripts' VERSION (config_loader.py); shown in the footer
let CONFIG = null;   // docs/data/config.json: the products + keywords that are in the sheet TODAY (with SKU and name)
let state = { projectId: null, marketplace: null, itemKey: null, range: "daily", days: 30, basis: "all", q: "", filter: "all", sort: { key: "now", dir: 1 }, helpOpen: false, view: "ranks", compKw: null, compDate: null, compDays: 30 };
let LAST_GRID = null; // what the grid currently shows, used by CSV export

// ---------- Language: English / German ----------
// Only interface text is translated. Keywords, product names, SKUs, IDs and project names come from the sheet and are
// always shown exactly as they are there.
const I18N = {
  en: {
    demoBanner: "Showing demo data — no real tracker data yet. Once the daily workflow has run, your real ranks replace this automatically.",
    nothingTracked: "Nothing is being tracked yet.",
    helpTitle: "Add or change what's tracked",
    helpTabs: "Your sheet has two tabs. <b>Keywords:</b> <code>project</code>, <code>keyword</code>. <b>Products:</b> <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (the ID from your own listing's URL), and optionally <code>name</code> and <code>source</code> (eBay only: <code>web</code> reads the real ebay.de page instead of eBay's search API).",
    helpEvery: "Every product in a project is checked against every keyword of that project, so each keyword is written once and each product is written once. A project can have several product IDs, on one marketplace or several.",
    helpLinked: '<a href="{url}" target="_blank" rel="noopener"><b>Open the tracking sheet</b></a> and add your rows there. They\'re picked up on the next hourly check.',
    helpNoSheet: "No Google Sheet is linked yet. Until you link one, copy the examples in <code>config/examples</code> to <code>config/keywords.csv</code> and <code>config/products.csv</code> in your GitHub repo and edit them (see the README for linking a Google Sheet, which is easier to edit).",
    helpNew: "A new keyword's history starts the first day it's checked. To check right away, run the workflow from your repo's <b>Actions</b> tab (<b>Track marketplace ranks → Run workflow</b>).",
    opensSheet: "Opens your Google Sheet in a new tab",
    addProducts: "+ Add products &amp; keywords",
    addKeyword: "+ Add keyword",
    lastChecked: "Last checked:",
    versionNote: "Dashboard files version",
    languageLabel: "Language",
    marketplace: "Marketplace",
    mpTitle: "Project marketplaces",
    mpProduct: "{n} product", mpProducts: "{n} products", mpKeyword: "{n} keyword", mpKeywords: "{n} keywords",
    mpTop10: "Top 10: {a} of {b}", mpVis: "Visibility {v}", mpAvg: "Avg. position {v}",
    mpChecked: "Last checked {when}", mpNoData: "No readings yet", mpBlocked: "{n} blocked",
    mpAdd: "Add new marketplace", mpMore: "More", mpMenuAdd: "Add products & keywords", mpMenuVisit: "Open {site}",
    mpOthers: "{n} more marketplace(s) in this project",
    pjTitle: "Projects", pjCntProjects: "Projects", pjCntProducts: "Products", pjCntKeywords: "Keywords",
    pjSearchPh: "Search by project, tag, product ID, SKU or keyword", pjCreate: "Create project",
    pjFilters: "Project filters", pjFilterMp: "Marketplace", pjFilterTag: "Tags", pjFilterClear: "Clear filters", pjNoTags: "No tags yet. Add them in your sheet (project_tags).",
    pjSortBy: "Sort by", pjSortOpened: "Last opened", pjSortName: "Name (A–Z)", pjSortChecked: "Last checked", pjSortVis: "Visibility", pjSortKw: "Most keywords", pjSortProd: "Most products",
    pjOpenSheet: "Open Google Sheet", pjGrid: "Grid view", pjListView: "List view", pjShowing: "Showing {a} of {b} projects", pjNone: "No project matches your search or filters.",
    pjWaiting: "Waiting for the first check (a new project starts within the hour)", pjWaitingShort: "waiting", pjLast: "Last checked {when}", pjMore: "More",
    pjMenuOpen: "Open project", pjMenuDetails: "Products & keywords", pjMenuEdit: "Picture, tags & note", pjMenuIds: "Copy product IDs", pjMenuKw: "Copy keywords",
    pjCopied: "Copied to the clipboard", pjCopyFailed: "Could not copy: select the text and copy it by hand",
    pjColProject: "Project", pjColMarkets: "Marketplaces", pjColProducts: "Products", pjColKeywords: "Keywords", pjColTop10: "Top 10", pjColVis: "Visibility", pjColChecked: "Last checked", pjColTags: "Tags",
    pjBack: "Projects", pjDetails: "Products & keywords", pjTabProducts: "Products", pjTabKeywords: "Keywords",
    pjColMp: "Marketplace", pjColSku: "SKU", pjColId: "Product ID", pjColName: "Name", pjOnlyOn: "only {mps}",
    pjCopyIdsBtn: "Copy product IDs", pjCopyKwBtn: "Copy keywords", pjOpenListing: "Open the listing",
    pjEditTitle: "Picture, tags & note", pjPicUrl: "Picture address or Google Drive link", pjPicUrlPh: "https://… or a Google Drive share link",
    pjPicFile: "Or choose a picture from your computer", pjPicDownload: "Download {file}",
    pjPicUpload: "Upload that file to the folder docs/images/projects/ of your GitHub repository (Add file → Upload files). The dashboard finds it by the project ID, so the sheet needs no change.",
    pjPicNoResize: "This browser cannot resize pictures. Save your picture as {file} yourself and upload it to docs/images/projects/.",
    pjPicBlank: "(leave empty, or write {file})", pjTagsLabel: "Tags (separated by commas)", pjNoteLabel: "Note (short)", pjCells: "Row for the Projects tab", pjCopyCells: "Copy row",
    pjCellsHow: "Put these values in the project's row of the Projects tab (one row per project; columns project, image, tags, note). Create that tab once, publish it as CSV like your other tabs, and add its link on a new line in the TRACKING_SHEET_CSV_URL secret.",
    pjOutProject: "Row for the Projects tab (picture, tags, note)", pjCopyRowProject: "Copy project row",
    pjProjectsTabHow: "Create a tab called Projects once (columns: project, image, tags, note), publish it like your other tabs and add its link to the TRACKING_SHEET_CSV_URL secret, one link per line.",
    pjCreateTitle: "Create project", pjName: "Project name", pjNamePh: "e.g. PP (Pool Covers)", pjImageOpt: "Picture address or Google Drive link (optional)",
    pjMarketplaces: "Marketplaces", pjCountry: "Country", pjIdsFor: "{mp} product IDs",
    pjIdsHelp: "One per line. Optional: add the SKU and the product name after the ID, separated by a comma or a tab.",
    pjKwLabel: "Keywords", pjKwHelp: "One per line. To limit one to some marketplaces add | and their names, e.g. poolplane | temu, kaufland.",
    pjOutProducts: "Rows for the Products tab", pjOutKeywords: "Rows for the Keywords tab", pjCopyRowsProducts: "Copy product rows", pjCopyRowsKeywords: "Copy keyword rows",
    pjMoreRows: "… and {n} more", pjHeaderRow: "Column order:",
    pjPasteHow: "Paste the product rows under the last row of your Products tab and the keyword rows under the last row of your Keywords tab. The tracker picks them up within the hour.",
    pjExists: "A project with this name already exists. These rows are added to it.", pjNeedName: "Enter a project name.", pjNeedMp: "Choose at least one marketplace.",
    pjNeedIds: "Add at least one product ID.", pjNeedKw: "Add at least one keyword.",
    pjUnknownMp: "Unknown marketplace “{x}” in a keyword line (known: eBay, Otto, Kaufland, Temu).", pjKwNotSel: "“{kw}” is limited to {mps}, which this project does not track.",
    pjDup: "Duplicate product ID {x} (listed once).", pjOttoWarn: "Otto currently blocks automatic reading, so its rows may stay empty.",
    pjEstimate: "Rough cost: about {usd} a month (one check a day; eBay, Otto and Kaufland at $1.50 per 1,000 requests and Kaufland reads 2 pages; Temu adds $1 per 1,000 successful reads).",
    pjBadImage: "That picture address is not an https link or a Google Drive link.", pjClose: "Close",
    pjPicSave: "Save picture as {file}", pjPicSaving: "Saving…",
    pjPicSaved: "Saved to {repo}. It is used in preference to a picture address in your sheet. GitHub Pages needs about a minute to publish it for everyone; here you already see it.",
    pjPicNeedName: "Enter the project name first: the picture is saved under the project's ID.", pjPicNeedToken: "Connect GitHub below first (one-time setup).",
    pjGhSummaryOff: "Save pictures right here: one-time setup", pjGhSummaryOn: "GitHub connected: pictures are saved right here",
    pjGhIntro: "A picture is saved as one small file in your GitHub repository. For that the dashboard needs a personal access token, which stays in this browser only.",
    pjGhIntroOn: "Pictures are saved into {repo} with the token kept in this browser.",
    pjGhS1: "Open the page that creates the token (the link fills in the name and the permission):", pjGhS1Link: "Create token on GitHub",
    pjGhS2: "Under “Repository access” choose “Only select repositories” and pick {repo}. Under “Repository permissions” set “Contents” to “Read and write”, and nothing else.",
    pjGhS3: "Click “Generate token”, copy it (it starts with github_pat_) and paste it here:", pjGhTokenPh: "github_pat_…", pjGhConnect: "Connect",
    pjGhOrgNote: "If your organization has to approve tokens, an owner must approve it before it works.",
    pjGhRisk: "Treat it like a password: anyone who can use this browser profile can write to the repository with it. A short expiry (30 to 90 days) is safest, and you can revoke it any time in your GitHub settings.",
    pjGhConnected: "Connected as {login}. The token stays in this browser.", pjGhRemove: "Remove the token from this browser", pjGhRemoved: "Token removed from this browser.", pjGhChecking: "Checking the token…",
    pjGhErrBad: "GitHub did not accept this token. Check that you copied all of it and that it has not expired.", pjGhErrNet: "Could not reach GitHub. Check your connection and try again.",
    pjGhErrHttp: "GitHub answered with an error ({status}). {message}",
    pjGhErrForbidden: "The token is not allowed to write to {repo}. Create it for that repository with “Contents: Read and write”. {message}",
    pjGhErrNoAccess: "GitHub cannot find {repo} for this token. When you create the token, choose that repository under “Repository access”.",
    pjGhErrConflict: "The picture changed on GitHub while saving. Please try again.",
    pjGhNoRepo: "The dashboard could not tell which GitHub repository it belongs to. Add \"github_repo\": \"owner/name\" to docs/settings.json.",
    searchPh: "Search SKU or product ID…",
    searchTitle: "Type to search by SKU, product ID or product name",
    showAllProducts: "Show all products",
    noProductMatch: "No product matches “{q}”",
    bestLabel: "All {mp} products — best position",
    nProducts: "{n} products",
    lastDays: "Last {n} days",
    allTime: "All time",
    countAll: "Count: all results",
    countOrganic: "Count: organic only",
    countTitle: "Which positions to count: every result, or only organic ones with paid placements removed",
    daily: "Daily", weekly: "Weekly", monthly: "Monthly",
    rangeAll: "ALL", rangeL: "L{n}D", weekPrefix: "wk",
    firstChecks: "first checks", noChange: "no change", vsPrev: "vs previous check", pts: " pts",
    visibility: "Visibility", visTitle: "Share of tracked keywords where your product was found, on the latest day",
    avgPos: "Average Position", avgTitle: "Average position across the entries where your product was found",
    top10Label: "Keywords in Top 10", of: "of", top10Title: "How many tracked keywords have your product in the top 10 results, on the latest day",
    distribution: "Distribution", distLast: "100+ / not found",
    noUsable: "No usable checks in this period yet.", noData: "no data",
    sectionFailed: "This section couldn't be drawn ({msg}).",
    rankedFirst: "Ranked first", position: "position", organicPosition: "organic position",
    posFor: "{basis} {rank} for “{kw}”",
    tiedWith: "Tied with", alsoRanking: "Also ranking ({n})", plusMore: "+{n} more",
    noOther: "No other product of yours ranks for this keyword.",
    copySku: "Copy SKU", copyId: "Copy ID", copyAll: "Copy all",
    pinned: "Pinned · click outside or press Esc to close", close: "Close", popLabel: "Which product ranked first",
    copied: "Copied ✓", pressCopy: "Press Ctrl/Cmd+C",
    copyRankedFirst: "Ranked first for “{kw}” ({date})", tied: "tied", alsoRankingColon: "Also ranking:",
    openOn: "↗ Open on {mp}", product: "Product",
    organic: "Organic", sponsored: "Sponsored (ad slot)", overallChip: "Overall (ads counted)",
    onePos: "This marketplace gives one position per check.",
    latestOrganic: "Latest organic", latestPosition: "Latest position", adOnly: "ad only", notFound: "not found",
    bestOrganic: "Best organic", foundStat: "Found", xOfYDays: "{found} of {checked} days",
    noReadings: "No readings for this keyword in the chosen period for this product.",
    rankHistory: "Rank history", inTheTop: "in the top {n}",
    tipOrganic: "Organic", tipShownAsAd: "— (shown as an ad)", tipAdSlot: "Ad slot", tipOverall: "Overall",
    tipAdsAbove: "{n} ad(s) above it", tipBestProduct: "Best product",
    geoDE: "German connection ✓", geoOther: "connection from outside Germany", langDE: "German page ✓", pageLang: "page language: {l}", shipTo: "ship-to {pc}",
    r7: "7D", r30: "1M", r90: "3M", r365: "1Y", rAll: "ALL",
    hintEbay: "“Open on {mp}” opens the same search the tracker reads{de}. If eBay opens in English, switch it to German first: in English eBay translates the keyword and shows a different list.",
    hintDe: " (German eBay, delivery postcode {pc})",
    hintOther: "“Open on {mp}” opens the search page for this keyword.",
    notChecked: "not checked", blockedTip: "the marketplace blocked this check, which is not the same as falling out of the rankings",
    notFoundTip: "not found", kwTitle: "Show this keyword's rank history",
    thKeyword: "Keyword ({n})",
    thNow: "Now", thNowTip: "Position at the most recent check", thBest: "Best", thBestTip: "Best position in the selected period",
    thAvg: "Avg", thAvgTip: "Average position over the checks where it was found", thFound: "Found", thFoundTip: "Share of checks where it was found at all",
    thChange: "Change", thChangeTip: "Change since the check before the latest one",
    newT: "new", lostT: "lost", posAtLatest: "position at the most recent check", bestColon: "best",
    carriedTip: "not re-checked today (nothing found in its last checks; re-checked weekly)",
    fAll: "All", fTop3: "In the top 3", fTop10: "In the top 10", fTop100: "In the top 100", fNotFound: "Not found",
    fImproved: "Moved up", fDropped: "Moved down", fNew: "Newly found", fLost: "Lost",
    filterTitle: "Filter rows", filterPh: "Filter keywords…",
    sincePrev: "Since the previous check:", mvUp: "▲ moved up", mvDown: "▼ moved down", mvNew: "● newly found", mvLost: "✕ lost",
    movementAfter: "Movement (▲ ▼) appears after the second daily check.",
    exportCsv: "Export CSV", noMatch: "Nothing matches this filter.", csvBlocked: "blocked",
    legendMain: "Each column is a day; the number is where the product appears in that marketplace's search results for the keyword (1 = first).",
    legendNf: "&gt;N not found in the top N checked", legendBlocked: "blocked by the marketplace", legendNotChecked: "not checked that day",
    legendHint: "<b>Hover a number</b> to see which product ranked first; <b>click it</b> to pin the note and copy the SKU.",
    tabRanks: "Ranks", tabCompetitors: "Competitors",
    compLoading: "Loading competitor data…",
    compNone: "No competitor data yet. It is saved from the next tracker run onwards, for eBay keywords read through the website.",
    compEbayOnly: "Competitor data is captured for eBay only for now. Switch to a project with eBay products.",
    compNoKw: "No data for this keyword on this day.", compNoKeywords: "This project has no eBay keywords yet.",
    compKeyword: "Keyword", compDay: "Day", compTrend: "Trend period",
    compTitleKw: "Top listings for “{kw}”",
    kpiSellers: "Sellers in the top 10", kpiSellersSub: "{n} named · {m} slots without a name",
    kpiAds: "Ads in the top 10", kpiAdsSub: "of 10 slots",
    kpiMedian: "Median price, top 10", kpiYourPrice: "Yours {p} ({d} vs median)", kpiNoPrice: "no price shown",
    kpiYourPos: "Your best position", kpiYourPosSub: "organic {o}", kpiNotInTop: "not in the top {n}",
    priceByPos: "Price by position, top 10", median: "median",
    thPos: "#", thListing: "Listing", thSeller: "Seller", thFeedback: "Feedback", thPrice: "Price", thDelivery: "Delivery", thSold: "Sold", thSoldSince: "Since last day",
    freeDelivery: "free", adBadge: "Ad", yoursBadge: "Yours", youBadge: "You", unnamedSeller: "private / unnamed", imageSlot: "(image-only slot)", withCoupon: "with coupon", atLeast: "at least",
    sovTitle: "Seller share of voice — this project, {date}",
    sovHint: "A top-10 slot earns 11 minus its position (position 1 = 10 points). Share = a seller's points divided by all points on this project's keywords.",
    thShare: "Share", thSlots: "Top-10 slots", thTop3: "Top-3 slots", thKeywords: "Keywords", thAsAd: "As ad", thTrendCol: "Trend",
    othersRow: "Other sellers (private or unnamed)",
    salesTitle: "Fastest-selling listings (estimated)",
    salesHint: "Estimated from the change in a listing's sold count between the first and the last day it was seen in the period. Counts shown as “88+” are left out. A rough guide only: listings with variations and eBay's rounding blur it.",
    thSoldPeriod: "Sold in period", thPerDay: "≈ per day", noSales: "Not enough days of data yet to estimate sales (the same listing is needed on at least two days).",
    compNote: "Seller names are shown for business sellers only. Positions are as eBay Germany showed them to the tracker, ads included. Sold counts are cumulative per listing.",
    openCompetitors: "Competitors",
  },
  de: {
    demoBanner: "Es werden Demodaten angezeigt – noch keine echten Tracker-Daten. Sobald der tägliche Workflow gelaufen ist, ersetzen die echten Rankings sie automatisch.",
    nothingTracked: "Es wird noch nichts getrackt.",
    helpTitle: "Getrackte Inhalte hinzufügen oder ändern",
    helpTabs: "Ihre Tabelle hat zwei Tabs. <b>Keywords:</b> <code>project</code>, <code>keyword</code>. <b>Products:</b> <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (die ID aus der URL Ihres eigenen Angebots) und optional <code>name</code> und <code>source</code> (nur eBay: <code>web</code> liest die echte ebay.de-Seite statt der eBay-Such-API).",
    helpEvery: "Jedes Produkt eines Projekts wird mit jedem Keyword dieses Projekts geprüft; deshalb wird jedes Keyword und jedes Produkt nur einmal eingetragen. Ein Projekt kann mehrere Produkt-IDs haben, auf einem oder mehreren Marktplätzen.",
    helpLinked: '<a href="{url}" target="_blank" rel="noopener"><b>Tracking-Tabelle öffnen</b></a> und dort die Zeilen ergänzen. Sie werden beim nächsten stündlichen Check übernommen.',
    helpNoSheet: "Es ist noch keine Google-Tabelle verknüpft. Kopieren Sie bis dahin die Beispiele aus <code>config/examples</code> nach <code>config/keywords.csv</code> und <code>config/products.csv</code> in Ihrem GitHub-Repository und bearbeiten Sie sie (zum Verknüpfen einer Google-Tabelle, die sich leichter bearbeiten lässt, siehe README).",
    helpNew: "Die Historie eines neuen Keywords beginnt am ersten Tag, an dem es geprüft wird. Für eine sofortige Prüfung den Workflow im Tab <b>Actions</b> Ihres Repositories starten (<b>Track marketplace ranks → Run workflow</b>).",
    opensSheet: "Öffnet Ihre Google-Tabelle in einem neuen Tab",
    addProducts: "+ Produkte &amp; Keywords hinzufügen",
    addKeyword: "+ Keyword hinzufügen",
    lastChecked: "Zuletzt geprüft:",
    versionNote: "Dashboard-Dateien Version",
    languageLabel: "Sprache",
    marketplace: "Marktplatz",
    mpTitle: "Projekt-Marktplätze",
    mpProduct: "{n} Produkt", mpProducts: "{n} Produkte", mpKeyword: "{n} Keyword", mpKeywords: "{n} Keywords",
    mpTop10: "Top 10: {a} von {b}", mpVis: "Sichtbarkeit {v}", mpAvg: "Ø Position {v}",
    mpChecked: "Zuletzt geprüft {when}", mpNoData: "Noch keine Messungen", mpBlocked: "{n} blockiert",
    mpAdd: "Neuen Marktplatz hinzufügen", mpMore: "Mehr", mpMenuAdd: "Produkte & Keywords hinzufügen", mpMenuVisit: "{site} öffnen",
    mpOthers: "{n} weitere(r) Marktplatz/Marktplätze in diesem Projekt",
    pjTitle: "Projekte", pjCntProjects: "Projekte", pjCntProducts: "Produkte", pjCntKeywords: "Keywords",
    pjSearchPh: "Suche nach Projekt, Tag, Produkt-ID, SKU oder Keyword", pjCreate: "Projekt erstellen",
    pjFilters: "Projektfilter", pjFilterMp: "Marktplatz", pjFilterTag: "Tags", pjFilterClear: "Filter zurücksetzen", pjNoTags: "Noch keine Tags. Tragen Sie diese in Ihrer Tabelle ein (project_tags).",
    pjSortBy: "Sortieren nach", pjSortOpened: "Zuletzt geöffnet", pjSortName: "Name (A–Z)", pjSortChecked: "Zuletzt geprüft", pjSortVis: "Sichtbarkeit", pjSortKw: "Meiste Keywords", pjSortProd: "Meiste Produkte",
    pjOpenSheet: "Google Sheet öffnen", pjGrid: "Kachelansicht", pjListView: "Listenansicht", pjShowing: "{a} von {b} Projekten", pjNone: "Kein Projekt passt zu Ihrer Suche oder Ihren Filtern.",
    pjWaiting: "Wartet auf die erste Prüfung (ein neues Projekt startet innerhalb einer Stunde)", pjWaitingShort: "wartet", pjLast: "Zuletzt geprüft {when}", pjMore: "Mehr",
    pjMenuOpen: "Projekt öffnen", pjMenuDetails: "Produkte & Keywords", pjMenuEdit: "Bild, Tags & Notiz", pjMenuIds: "Produkt-IDs kopieren", pjMenuKw: "Keywords kopieren",
    pjCopied: "In die Zwischenablage kopiert", pjCopyFailed: "Kopieren nicht möglich: Text markieren und von Hand kopieren",
    pjColProject: "Projekt", pjColMarkets: "Marktplätze", pjColProducts: "Produkte", pjColKeywords: "Keywords", pjColTop10: "Top 10", pjColVis: "Sichtbarkeit", pjColChecked: "Zuletzt geprüft", pjColTags: "Tags",
    pjBack: "Projekte", pjDetails: "Produkte & Keywords", pjTabProducts: "Produkte", pjTabKeywords: "Keywords",
    pjColMp: "Marktplatz", pjColSku: "SKU", pjColId: "Produkt-ID", pjColName: "Name", pjOnlyOn: "nur {mps}",
    pjCopyIdsBtn: "Produkt-IDs kopieren", pjCopyKwBtn: "Keywords kopieren", pjOpenListing: "Angebot öffnen",
    pjEditTitle: "Bild, Tags & Notiz", pjPicUrl: "Bildadresse oder Google-Drive-Link", pjPicUrlPh: "https://… oder ein Google-Drive-Freigabelink",
    pjPicFile: "Oder ein Bild von Ihrem Computer wählen", pjPicDownload: "{file} herunterladen",
    pjPicUpload: "Laden Sie diese Datei in den Ordner docs/images/projects/ Ihres GitHub-Repositories hoch (Add file → Upload files). Das Dashboard findet sie über die Projekt-ID, die Tabelle muss nicht geändert werden.",
    pjPicNoResize: "Dieser Browser kann Bilder nicht verkleinern. Speichern Sie Ihr Bild selbst als {file} und laden Sie es nach docs/images/projects/ hoch.",
    pjPicBlank: "(leer lassen oder {file} eintragen)", pjTagsLabel: "Tags (durch Kommas getrennt)", pjNoteLabel: "Notiz (kurz)", pjCells: "Zeile für den Tab Projects", pjCopyCells: "Zeile kopieren",
    pjCellsHow: "Tragen Sie diese Werte in der Zeile des Projekts im Tab Projects ein (eine Zeile pro Projekt; Spalten project, image, tags, note). Diesen Tab legen Sie einmalig an, veröffentlichen ihn wie Ihre anderen Tabs als CSV und tragen seinen Link in einer neuen Zeile im Secret TRACKING_SHEET_CSV_URL ein.",
    pjOutProject: "Zeile für den Tab Projects (Bild, Tags, Notiz)", pjCopyRowProject: "Projektzeile kopieren",
    pjProjectsTabHow: "Legen Sie einmalig einen Tab namens Projects an (Spalten: project, image, tags, note), veröffentlichen Sie ihn wie Ihre anderen Tabs und tragen Sie seinen Link im Secret TRACKING_SHEET_CSV_URL ein, ein Link pro Zeile.",
    pjCreateTitle: "Projekt erstellen", pjName: "Projektname", pjNamePh: "z. B. PP (Pool Covers)", pjImageOpt: "Bildadresse oder Google-Drive-Link (optional)",
    pjMarketplaces: "Marktplätze", pjCountry: "Land", pjIdsFor: "{mp}-Produkt-IDs",
    pjIdsHelp: "Eine pro Zeile. Optional: nach der ID SKU und Produktname anfügen, getrennt durch Komma oder Tab.",
    pjKwLabel: "Keywords", pjKwHelp: "Eines pro Zeile. Um eines auf einzelne Marktplätze zu beschränken, | und deren Namen anfügen, z. B. poolplane | temu, kaufland.",
    pjOutProducts: "Zeilen für den Tab Products", pjOutKeywords: "Zeilen für den Tab Keywords", pjCopyRowsProducts: "Produktzeilen kopieren", pjCopyRowsKeywords: "Keyword-Zeilen kopieren",
    pjMoreRows: "… und {n} weitere", pjHeaderRow: "Spaltenreihenfolge:",
    pjPasteHow: "Fügen Sie die Produktzeilen unter der letzten Zeile des Tabs Products und die Keyword-Zeilen unter der letzten Zeile des Tabs Keywords ein. Der Tracker übernimmt sie innerhalb einer Stunde.",
    pjExists: "Ein Projekt mit diesem Namen gibt es bereits. Diese Zeilen werden ihm hinzugefügt.", pjNeedName: "Bitte einen Projektnamen eingeben.", pjNeedMp: "Mindestens einen Marktplatz wählen.",
    pjNeedIds: "Mindestens eine Produkt-ID eintragen.", pjNeedKw: "Mindestens ein Keyword eintragen.",
    pjUnknownMp: "Unbekannter Marktplatz „{x}“ in einer Keyword-Zeile (bekannt: eBay, Otto, Kaufland, Temu).", pjKwNotSel: "„{kw}“ ist auf {mps} beschränkt, die dieses Projekt nicht trackt.",
    pjDup: "Doppelte Produkt-ID {x} (nur einmal aufgeführt).", pjOttoWarn: "Otto blockiert derzeit das automatische Auslesen, die Zeilen können daher leer bleiben.",
    pjEstimate: "Grobe Kosten: etwa {usd} pro Monat (eine Prüfung täglich; eBay, Otto und Kaufland zu 1,50 $ pro 1.000 Anfragen, Kaufland liest 2 Seiten; bei Temu kommt 1 $ pro 1.000 erfolgreichen Abrufen dazu).",
    pjBadImage: "Diese Bildadresse ist weder ein https-Link noch ein Google-Drive-Link.", pjClose: "Schließen",
    pjPicSave: "Bild als {file} speichern", pjPicSaving: "Wird gespeichert…",
    pjPicSaved: "In {repo} gespeichert. Es hat Vorrang vor einer Bildadresse in Ihrer Tabelle. GitHub Pages braucht etwa eine Minute, um es für alle zu veröffentlichen; hier sehen Sie es schon.",
    pjPicNeedName: "Bitte zuerst den Projektnamen eingeben: das Bild wird unter der Projekt-ID gespeichert.", pjPicNeedToken: "Bitte zuerst unten GitHub verbinden (einmalige Einrichtung).",
    pjGhSummaryOff: "Bilder direkt hier speichern: einmalige Einrichtung", pjGhSummaryOn: "GitHub verbunden: Bilder werden direkt hier gespeichert",
    pjGhIntro: "Ein Bild wird als kleine Datei in Ihrem GitHub-Repository gespeichert. Dafür braucht das Dashboard ein persönliches Zugriffstoken, das nur in diesem Browser bleibt.",
    pjGhIntroOn: "Bilder werden in {repo} gespeichert, mit dem Token aus diesem Browser.",
    pjGhS1: "Öffnen Sie die Seite zum Erstellen des Tokens (der Link füllt Name und Berechtigung aus):", pjGhS1Link: "Token auf GitHub erstellen",
    pjGhS2: "Wählen Sie unter „Repository access“ die Option „Only select repositories“ und dort {repo}. Setzen Sie unter „Repository permissions“ den Punkt „Contents“ auf „Read and write“, sonst nichts.",
    pjGhS3: "Klicken Sie auf „Generate token“, kopieren Sie es (es beginnt mit github_pat_) und fügen Sie es hier ein:", pjGhTokenPh: "github_pat_…", pjGhConnect: "Verbinden",
    pjGhOrgNote: "Wenn Ihre Organisation Tokens freigeben muss, muss ein Owner es freigeben, bevor es funktioniert.",
    pjGhRisk: "Behandeln Sie es wie ein Passwort: Wer dieses Browserprofil nutzen kann, kann damit in das Repository schreiben. Eine kurze Laufzeit (30 bis 90 Tage) ist am sichersten; in Ihren GitHub-Einstellungen können Sie es jederzeit widerrufen.",
    pjGhConnected: "Verbunden als {login}. Das Token bleibt in diesem Browser.", pjGhRemove: "Token aus diesem Browser entfernen", pjGhRemoved: "Token aus diesem Browser entfernt.", pjGhChecking: "Token wird geprüft…",
    pjGhErrBad: "GitHub hat dieses Token nicht akzeptiert. Prüfen Sie, ob Sie es vollständig kopiert haben und ob es noch gültig ist.", pjGhErrNet: "GitHub ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    pjGhErrHttp: "GitHub hat mit einem Fehler geantwortet ({status}). {message}",
    pjGhErrForbidden: "Das Token darf nicht in {repo} schreiben. Erstellen Sie es für dieses Repository mit „Contents: Read and write“. {message}",
    pjGhErrNoAccess: "GitHub findet {repo} für dieses Token nicht. Wählen Sie beim Erstellen des Tokens unter „Repository access“ dieses Repository.",
    pjGhErrConflict: "Das Bild wurde beim Speichern auf GitHub geändert. Bitte versuchen Sie es erneut.",
    pjGhNoRepo: "Das Dashboard konnte nicht erkennen, zu welchem GitHub-Repository es gehört. Tragen Sie \"github_repo\": \"owner/name\" in docs/settings.json ein.",
    searchPh: "SKU oder Produkt-ID suchen…",
    searchTitle: "Tippen, um nach SKU, Produkt-ID oder Produktname zu suchen",
    showAllProducts: "Alle Produkte anzeigen",
    noProductMatch: "Kein Produkt passt zu „{q}“",
    bestLabel: "Alle {mp}-Produkte — beste Position",
    nProducts: "{n} Produkte",
    lastDays: "Letzte {n} Tage",
    allTime: "Gesamter Zeitraum",
    countAll: "Zählung: alle Ergebnisse",
    countOrganic: "Zählung: nur organisch",
    countTitle: "Welche Positionen gezählt werden: alle Ergebnisse oder nur organische ohne bezahlte Platzierungen",
    daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich",
    rangeAll: "ALLE", rangeL: "L{n}T", weekPrefix: "Wo.",
    firstChecks: "erste Prüfungen", noChange: "keine Änderung", vsPrev: "ggü. letzter Prüfung", pts: " Pkt.",
    visibility: "Sichtbarkeit", visTitle: "Anteil der getrackten Keywords, bei denen Ihr Produkt am letzten Tag gefunden wurde",
    avgPos: "Durchschnittliche Position", avgTitle: "Durchschnittliche Position über die Einträge, bei denen Ihr Produkt gefunden wurde",
    top10Label: "Keywords in den Top 10", of: "von", top10Title: "Bei wie vielen getrackten Keywords Ihr Produkt am letzten Tag unter den Top-10-Ergebnissen steht",
    distribution: "Verteilung", distLast: "100+ / nicht gefunden",
    noUsable: "In diesem Zeitraum gibt es noch keine verwertbaren Prüfungen.", noData: "keine Daten",
    sectionFailed: "Dieser Bereich konnte nicht dargestellt werden ({msg}).",
    rankedFirst: "Auf Platz 1", position: "Position", organicPosition: "organische Position",
    posFor: "{basis} {rank} für „{kw}“",
    tiedWith: "Gleichauf mit", alsoRanking: "Außerdem platziert ({n})", plusMore: "+{n} weitere",
    noOther: "Kein anderes Ihrer Produkte rankt für dieses Keyword.",
    copySku: "SKU kopieren", copyId: "ID kopieren", copyAll: "Alles kopieren",
    pinned: "Fixiert · außerhalb klicken oder Esc drücken zum Schließen", close: "Schließen", popLabel: "Welches Produkt auf Platz 1 steht",
    copied: "Kopiert ✓", pressCopy: "Strg/Cmd+C drücken",
    copyRankedFirst: "Platz 1 für „{kw}“ ({date})", tied: "gleichauf", alsoRankingColon: "Außerdem platziert:",
    openOn: "↗ Auf {mp} öffnen", product: "Produkt",
    organic: "Organisch", sponsored: "Gesponsert (Anzeigenplatz)", overallChip: "Gesamt (inkl. Anzeigen)",
    onePos: "Dieser Marktplatz liefert pro Prüfung eine Position.",
    latestOrganic: "Aktuell organisch", latestPosition: "Aktuelle Position", adOnly: "nur Anzeige", notFound: "nicht gefunden",
    bestOrganic: "Beste organische", foundStat: "Gefunden", xOfYDays: "{found} von {checked} Tagen",
    noReadings: "Für dieses Keyword gibt es im gewählten Zeitraum keine Messwerte für dieses Produkt.",
    rankHistory: "Ranking-Verlauf", inTheTop: "in den Top {n}",
    tipOrganic: "Organisch", tipShownAsAd: "— (als Anzeige gezeigt)", tipAdSlot: "Anzeigenplatz", tipOverall: "Gesamt",
    tipAdsAbove: "{n} Anzeige(n) darüber", tipBestProduct: "Bestes Produkt",
    geoDE: "Deutsche Verbindung ✓", geoOther: "Verbindung von außerhalb Deutschlands", langDE: "Deutsche Seite ✓", pageLang: "Seitensprache: {l}", shipTo: "Lieferung nach {pc}",
    r7: "7T", r30: "1M", r90: "3M", r365: "1J", rAll: "ALLE",
    hintEbay: "„Auf {mp} öffnen“ öffnet dieselbe Suche, die der Tracker liest{de}. Öffnet sich eBay auf Englisch, stellen Sie es zuerst auf Deutsch um: Auf Englisch übersetzt eBay das Keyword und zeigt eine andere Liste.",
    hintDe: " (eBay Deutschland, Lieferpostleitzahl {pc})",
    hintOther: "„Auf {mp} öffnen“ öffnet die Suchseite für dieses Keyword.",
    notChecked: "nicht geprüft", blockedTip: "der Marktplatz hat diese Prüfung blockiert; das ist nicht dasselbe wie aus dem Ranking zu fallen",
    notFoundTip: "nicht gefunden", kwTitle: "Ranking-Verlauf dieses Keywords anzeigen",
    thKeyword: "Keyword ({n})",
    thNow: "Aktuell", thNowTip: "Position bei der letzten Prüfung", thBest: "Beste", thBestTip: "Beste Position im gewählten Zeitraum",
    thAvg: "Ø", thAvgTip: "Durchschnittliche Position über die Prüfungen, bei denen es gefunden wurde", thFound: "Gefunden", thFoundTip: "Anteil der Prüfungen, bei denen es überhaupt gefunden wurde",
    thChange: "Änderung", thChangeTip: "Änderung seit der Prüfung vor der letzten",
    newT: "neu", lostT: "verloren", posAtLatest: "Position bei der letzten Prüfung", bestColon: "beste",
    carriedTip: "heute nicht erneut geprüft (in den letzten Prüfungen nichts gefunden; wird wöchentlich neu geprüft)",
    fAll: "Alle", fTop3: "In den Top 3", fTop10: "In den Top 10", fTop100: "In den Top 100", fNotFound: "Nicht gefunden",
    fImproved: "Verbessert", fDropped: "Verschlechtert", fNew: "Neu gefunden", fLost: "Verloren",
    filterTitle: "Zeilen filtern", filterPh: "Keywords filtern…",
    sincePrev: "Seit der letzten Prüfung:", mvUp: "▲ verbessert", mvDown: "▼ verschlechtert", mvNew: "● neu gefunden", mvLost: "✕ verloren",
    movementAfter: "Bewegung (▲ ▼) erscheint nach der zweiten täglichen Prüfung.",
    exportCsv: "CSV exportieren", noMatch: "Keine Treffer für diesen Filter.", csvBlocked: "blockiert",
    legendMain: "Jede Spalte ist ein Tag; die Zahl zeigt, an welcher Stelle das Produkt in den Suchergebnissen des Marktplatzes für das Keyword erscheint (1 = erster).",
    legendNf: "&gt;N nicht in den geprüften Top N gefunden", legendBlocked: "blockiert vom Marktplatz", legendNotChecked: "an diesem Tag nicht geprüft",
    legendHint: "<b>Zahl überfahren</b>, um zu sehen, welches Produkt auf Platz 1 stand; <b>anklicken</b>, um den Hinweis zu fixieren und die SKU zu kopieren.",
    tabRanks: "Rankings", tabCompetitors: "Wettbewerber",
    compLoading: "Wettbewerbsdaten werden geladen…",
    compNone: "Noch keine Wettbewerbsdaten. Sie werden ab dem nächsten Tracker-Lauf gespeichert, für eBay-Keywords, die über die Webseite gelesen werden.",
    compEbayOnly: "Wettbewerbsdaten werden vorerst nur für eBay erfasst. Wechseln Sie zu einem Projekt mit eBay-Produkten.",
    compNoKw: "Für dieses Keyword gibt es an diesem Tag keine Daten.", compNoKeywords: "Dieses Projekt hat noch keine eBay-Keywords.",
    compKeyword: "Keyword", compDay: "Tag", compTrend: "Trendzeitraum",
    compTitleKw: "Top-Angebote für „{kw}“",
    kpiSellers: "Verkäufer in den Top 10", kpiSellersSub: "{n} benannt · {m} Plätze ohne Namen",
    kpiAds: "Anzeigen in den Top 10", kpiAdsSub: "von 10 Plätzen",
    kpiMedian: "Medianpreis, Top 10", kpiYourPrice: "Ihr Preis {p} ({d} ggü. Median)", kpiNoPrice: "kein Preis angezeigt",
    kpiYourPos: "Ihre beste Position", kpiYourPosSub: "organisch {o}", kpiNotInTop: "nicht in den Top {n}",
    priceByPos: "Preis nach Position, Top 10", median: "Median",
    thPos: "#", thListing: "Angebot", thSeller: "Verkäufer", thFeedback: "Bewertung", thPrice: "Preis", thDelivery: "Versand", thSold: "Verkauft", thSoldSince: "Seit letztem Tag",
    freeDelivery: "gratis", adBadge: "Anz.", yoursBadge: "Ihr Angebot", youBadge: "Sie", unnamedSeller: "privat / unbenannt", imageSlot: "(reiner Bild-Platz)", withCoupon: "mit Gutschein", atLeast: "mindestens",
    sovTitle: "Sichtbarkeitsanteil der Verkäufer — dieses Projekt, {date}",
    sovHint: "Ein Top-10-Platz bringt 11 minus Position (Platz 1 = 10 Punkte). Anteil = Punkte eines Verkäufers geteilt durch alle Punkte der Keywords dieses Projekts.",
    thShare: "Anteil", thSlots: "Top-10-Plätze", thTop3: "Top-3-Plätze", thKeywords: "Keywords", thAsAd: "Als Anzeige", thTrendCol: "Verlauf",
    othersRow: "Andere Verkäufer (privat oder unbenannt)",
    salesTitle: "Am schnellsten verkaufte Angebote (geschätzt)",
    salesHint: "Geschätzt aus der Änderung des Verkaufszählers eines Angebots zwischen dem ersten und dem letzten Tag, an dem es im Zeitraum gesehen wurde. Zähler wie „88+“ bleiben außen vor. Nur ein grober Anhaltspunkt: Angebote mit Varianten und Rundungen von eBay verfälschen ihn.",
    thSoldPeriod: "Verkauft im Zeitraum", thPerDay: "≈ pro Tag", noSales: "Noch nicht genug Tage mit Daten, um Verkäufe zu schätzen (dasselbe Angebot wird an mindestens zwei Tagen benötigt).",
    compNote: "Verkäufernamen werden nur für gewerbliche Verkäufer angezeigt. Positionen so, wie eBay Deutschland sie dem Tracker gezeigt hat, inklusive Anzeigen. Verkaufszähler sind pro Angebot kumuliert.",
    openCompetitors: "Wettbewerber",
  },
};

function initialLang() {
  try { const q = new URLSearchParams(location.search).get("lang"); if (q === "de" || q === "en") return q; } catch (e) { /* no URL: ignore */ }
  try { const saved = localStorage.getItem("rt_lang"); if (saved === "de" || saved === "en") return saved; } catch (e) { /* storage blocked: ignore */ }
  return String(navigator.language || "").toLowerCase().startsWith("de") ? "de" : "en";
}
let LANG = initialLang();
const LOCALE = () => (LANG === "de" ? "de-DE" : "en-US");
function t(key, vars) {
  let str = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  if (vars) Object.keys(vars).forEach((k) => { str = str.split("{" + k + "}").join(vars[k]); });
  return str;
}
// numbers: decimal comma in German
function nf(v, dec = 1) { const x = Number(v).toFixed(dec); return LANG === "de" ? x.replace(".", ",") : x; }
const pct = (v, dec = 0) => (LANG === "de" ? nf(v, dec) + "\u00a0%" : nf(v, dec) + "%");

function langToggleHTML() {
  return `<div class="lang-toggle" role="group" aria-label="${esc(t("languageLabel"))}"><button type="button" data-lang="en" class="${LANG === "en" ? "active" : ""}" title="English" aria-pressed="${LANG === "en"}">EN</button><button type="button" data-lang="de" class="${LANG === "de" ? "active" : ""}" title="Deutsch" aria-pressed="${LANG === "de"}">DE</button></div>`;
}
function setLang(code) {
  if (code !== "en" && code !== "de") return;
  LANG = code;
  try { localStorage.setItem("rt_lang", code); } catch (e) { /* storage blocked: the choice just lasts for this visit */ }
  document.documentElement.lang = code;
  if (typeof closePjModal === "function") closePjModal();
  renderPage();                                        // keeps the selected project, marketplace, product, filter and sort
  if (typeof MODAL !== "undefined" && MODAL.keyword) renderKeywordModal();
}
function bindLangToggle() {
  document.querySelectorAll(".lang-toggle button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
}

// ---------- Small helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uniq(arr) { return [...new Set(arr)]; }
function mean(nums) {
  const v = nums.filter((n) => n !== null && n !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
// All date maths is done in UTC so results don't shift by a day depending on
// the viewer's time zone.
function utcDate(iso) { return new Date(iso + "T00:00:00Z"); }
function shiftDate(iso, days) {
  const d = utcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDateShort(iso) {
  return utcDate(iso).toLocaleDateString(LOCALE(), { day: "2-digit", month: "short", timeZone: "UTC" });
}
function isoWeekStart(iso) {
  const d = utcDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  return utcDate(key + "-01").toLocaleDateString(LOCALE(), { month: "short", year: "numeric", timeZone: "UTC" });
}
function tierClass(rank) {
  if (rank === "BLOCKED") return "r-blocked";
  if (rank === null || rank === undefined) return "r-5";
  if (rank <= 3) return "r-1";
  if (rank <= 10) return "r-2";
  if (rank <= 50) return "r-3";
  if (rank <= 100) return "r-4";
  return "r-5";
}

// ---------- Data loading ----------
async function fetchJSON(path) {
  try {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ---------- the history: monthly files (data/ranks/YYYY-MM.json) or, until those exist, the old single data/ranks.json ----------
// A monthly file lists each repeated string once (items, keywords, page contexts) and each reading as a short list of numbers;
// scripts/history_store.py documents the layout. This turns it back into the same row objects the old file held.
function decodeMonth(shard) {
  if (shard.v === 1) return shard.rows;
  const month = shard.month, pad = (n) => String(n).padStart(2, "0"), rows = new Array(shard.rows.length);
  for (let n = 0; n < shard.rows.length; n++) {
    const a = shard.rows[n], row = Object.assign({}, shard.items[a[2]]);
    row.date = `${month}-${pad(a[0])}`;
    row.checked_at = `${row.date}T${pad((a[1] / 3600) | 0)}:${pad(((a[1] % 3600) / 60) | 0)}:${pad(a[1] % 60)}+00:00`;
    row.keyword = shard.kws[a[3]];
    row.rank = a[5];
    row.results_scanned = a[6];
    const keys = shard.shapes[a[4]];
    for (let i = 0; i < keys.length; i++) {
      const v = a[7 + i];
      if (keys[i] === "@ctx") { const c = shard.ctx[v]; row.page_lang = c[0]; row.page_geo = c[1]; row.page_shipto = c[2]; }
      else row[keys[i]] = v;
    }
    rows[n] = row;
  }
  return rows;
}

async function loadHistory() {
  const idx = await fetchJSON("data/ranks/index.json");
  if (idx && Array.isArray(idx.months) && idx.months.length) {
    const shards = await Promise.all(idx.months.map((m) => fetchJSON(`data/ranks/${m}.json`)));
    if (shards.every(Boolean)) return shards.flatMap(decodeMonth);
    console.warn("a monthly history file could not be read; using the older single file if there is one");
    const legacy = await fetchJSON("data/ranks.json");
    return legacy && legacy.length ? legacy : shards.filter(Boolean).flatMap(decodeMonth);   // never show half the months silently when a complete older copy exists
  }
  return await fetchJSON("data/ranks.json");
}

async function loadData() {
  let rows = await loadHistory();
  IS_DEMO = false;
  if (!rows || rows.length === 0) {
    rows = await fetchJSON("data/demo-ranks.json");
    IS_DEMO = true;
  }
  ALL_ROWS = rows || [];
  SETTINGS = (await fetchJSON("settings.json")) || {};
  CONFIG = IS_DEMO ? null : await fetchJSON("data/config.json");
  // Open on organic positions (paid "Anzeige" slots left out) whenever the data has them; the dropdown switches back to
  // "all results". Only on the first load, so a choice made later is never overridden.
  if (!IS_DEMO && ALL_ROWS.some((r) => r.organic_rank !== undefined)) state.basis = "organic";
  PROJECTS = buildProjects(ALL_ROWS);
}

// ranks.json is a history: keywords and products removed from the sheet stay in it (so nothing is lost and they
// come back with their history if re-added), but the dashboard shows only what the sheet has today (config.json).
function visibleRows(rows) {
  if (!CONFIG || !Array.isArray(CONFIG.projects) || IS_DEMO) return rows;
  const allowed = new Set();
  CONFIG.projects.forEach((p) => (p.items || []).forEach((i) => (i.keywords || []).forEach((k) => allowed.add(`${p.project_id}|${i.item_key}|${k}`))));
  const kept = rows.filter((r) => allowed.has(`${r.project_id}|${r.item_key}|${r.keyword}`));
  if (!kept.length && rows.length) { console.warn("config.json matches none of the saved rows; showing everything"); return rows; }
  return kept;
}

// Which position counts: every result (as listed), or "organic only" with paid placements removed.
// Rows that have no organic position (other marketplaces, older checks) always use their normal rank.
function applyBasis(rows) {
  rows.forEach((r) => {
    if (r.rank_all === undefined) r.rank_all = r.rank;
    r.rank = state.basis === "organic" && r.organic_rank !== undefined ? r.organic_rank : r.rank_all;
  });
}

function buildProjects(allRows) {
  applyBasis(allRows);
  const rows = visibleRows(allRows);
  const map = {};
  rows.forEach((r) => {
    const p = (map[r.project_id] = map[r.project_id] || {
      project_id: r.project_id, project_name: r.project_name, items: {}, rows: [],
    });
    p.rows.push(r);
    const it = (p.items[r.item_key] = p.items[r.item_key] || {
      item_key: r.item_key, marketplace: r.marketplace, country: r.country, product_id: r.item_id || r.item_key, label: null, rows: [],
    });
    it.rows.push(r);
    if (r.item_label) it.label = r.item_label; // optional product name from the sheet's Products tab
    if (r.item_sku) it.sku = r.item_sku;       // optional SKU
  });
  // the sheet as it is today wins over what older rows carry (SKU, product name, project name)
  if (CONFIG && Array.isArray(CONFIG.projects) && !IS_DEMO) {
    CONFIG.projects.forEach((cp) => {
      const p = map[cp.project_id];
      if (!p) return;
      if (cp.project_name) p.project_name = cp.project_name;
      (cp.items || []).forEach((ci) => {
        const it = p.items[ci.item_key];
        if (!it) return;
        if (ci.label) it.label = ci.label;
        if (ci.sku) it.sku = ci.sku;
      });
    });
  }
  Object.values(map).forEach((p) => {
    const byMp = {};
    Object.values(p.items).forEach((i) => (byMp[i.marketplace] = byMp[i.marketplace] || []).push(i));
    Object.entries(byMp).forEach(([mp, list]) => {
      if (list.length < 2) return;
      // "All <marketplace> products - best position": for every keyword and day, the best (lowest) rank among that
      // marketplace's products in the project. Computed on demand, so it follows the "all results / organic only" switch.
      const key = "__best__:" + mp;
      p.items[key] = {
        item_key: key, marketplace: mp, country: "", product_id: "all", synthetic: true, count: list.length,
        get label() { return t("bestLabel", { mp: MP_LABEL[mp] || mp }); },
        get rows() { return bestRows(p, mp, key); },
      };
    });
  });
  return map;
}

function bestRows(project, mp, key) {
  const real = Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === mp);
  const multiCountry = new Set(real.map((i) => i.country)).size > 1;
  const who = (it) => `${it.sku ? it.sku + " · " : ""}${it.product_id}${multiCountry && it.country ? " · " + it.country : ""}`;
  const out = {};
  real.forEach((it) => {
    it.rows.forEach((r) => {
      const k = r.keyword + "\u0000" + r.date;
      const a = (out[k] = out[k] || {
        date: r.date, checked_at: r.checked_at, project_id: r.project_id, project_name: r.project_name, item_key: key,
        marketplace: mp, country: "", keyword: r.keyword, rank: null, item_id: "all", results_scanned: r.results_scanned,
        blocked: true, holder: null, found_n: 0, others: [], tied: [], _list: [],
      });
      if (!r.blocked) {
        a.blocked = false;
        if (r.rank !== null && r.rank !== undefined) a._list.push({ who: who(it), sku: it.sku || "", id: String(it.product_id), rank: r.rank });
        a.results_scanned = Math.max(a.results_scanned || 0, r.results_scanned || 0) || r.results_scanned;
      }
      if ((r.checked_at || "") > (a.checked_at || "")) a.checked_at = r.checked_at;
    });
  });
  return Object.values(out).map((a) => {
    a._list.sort((x, y) => x.rank - y.rank);
    if (a._list.length) {
      a.rank = a._list[0].rank; a.holder = a._list[0].who; a.holder_sku = a._list[0].sku; a.holder_id = a._list[0].id; a.found_n = a._list.length;
      a.tied = a._list.slice(1).filter((e) => e.rank === a.rank).map((e) => e.who);
      a.others = a._list.slice(1).filter((e) => e.rank !== a.rank);
    }
    delete a._list;
    return a;
  });
}

function cmpSku(a, b) {
  const sa = a.sku || "", sb = b.sku || "";
  if (sa && sb) return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" }) || String(a.product_id).localeCompare(String(b.product_id));
  if (sa !== sb) return sa ? -1 : 1;           // products with a SKU first
  return String(a.product_id).localeCompare(String(b.product_id));
}

function marketplacesOf(project) {
  const present = new Set(Object.values(project.items).map((i) => i.marketplace));
  return [...MP_ORDER.filter((m) => present.has(m)), ...[...present].filter((m) => !MP_ORDER.includes(m))];
}

function sortedItems(project, mp) {
  return Object.values(project.items).filter((i) => !mp || i.marketplace === mp).sort(
    (a, b) =>
      (b.synthetic ? 1 : 0) - (a.synthetic ? 1 : 0) ||
      MP_ORDER.indexOf(a.marketplace) - MP_ORDER.indexOf(b.marketplace) ||
      a.country.localeCompare(b.country) ||
      cmpSku(a, b)
  );
}

// ---------- Current selection ----------
function currentProject() { return PROJECTS[state.projectId]; }
function currentItem() { return currentProject().items[state.itemKey]; }

// Rows inside the selected period, counted back from the newest check among them.
function inPeriod(rows) {
  if (state.days === "all" || !rows.length) return rows;
  const latest = rows.map((r) => r.date).sort().pop();
  const cutoff = shiftDate(latest, -(state.days - 1));
  return rows.filter((r) => r.date >= cutoff);
}
const fmtFull = (iso) => utcDate(iso).toLocaleDateString(LOCALE(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function daysBetween(a, b) { return Math.round((utcDate(b) - utcDate(a)) / 86400000); }
const MIN_DAILY_COLUMNS = 14; // keep the table's full shape even in the first days of tracking

function itemText(i, withCountry = false) {
  if (i.synthetic) return `★ ${i.label} (${t("nProducts", { n: i.count })})`;
  const core = i.sku ? `${i.sku} · ${i.product_id}` : String(i.product_id);
  return withCountry && i.country ? `${core} · ${i.country}` : core;
}
// Heatmap colours come from the brand's own Success -> Warning -> Error colours
// (#10B981, #F59E0B, #EF4444), blended by rank: 1 = success, ~30 = warning, 150+ = error.
// Plain #rrggbb values, so they render identically in every browser and export.
const BRAND_HEAT = [[16, 185, 129], [245, 158, 11], [239, 68, 68]];
function heatRGB(rank) {
  const t = Math.min(1, Math.log(Math.max(rank, 1)) / Math.log(150));
  const [a, b, u] = t < 0.7 ? [BRAND_HEAT[0], BRAND_HEAT[1], t / 0.7] : [BRAND_HEAT[1], BRAND_HEAT[2], (t - 0.7) / 0.3];
  return a.map((v, i) => v + (b[i] - v) * u);
}
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function heat(rank) {                       // pastel cell background + dark readable number
  const c = heatRGB(rank);
  return { bg: toHex(c.map((v) => v + (255 - v) * 0.78)), fg: toHex(c.map((v) => v * 0.42)) };
}
const DIST_COLORS = [1, 7, 28, 75, 150].map((r) => toHex(heatRGB(r)));   // solid bar colours
const DIST_LABELS = ["1-3", "4-10", "11-50", "51-100", ""];
const distLabel = (i) => (i === 4 ? t("distLast") : DIST_LABELS[i]);
const bucketOf = (rank) => (rank === null ? 4 : rank <= 3 ? 0 : rank <= 10 ? 1 : rank <= 50 ? 2 : rank <= 100 ? 3 : 4);

// Draw one section; if it fails, say so in that spot but keep the rest of the page.
function safely(hostId, fn) {
  try { fn(); } catch (e) {
    console.error(e);
    const el = document.getElementById(hostId);
    if (el) el.innerHTML = `<div class="empty-state">${esc(t("sectionFailed", { msg: e.message }))}</div>`;
  }
}

// ---------- Page ----------
async function boot() {
  document.documentElement.lang = LANG;
  await Promise.all([loadData(), probeCompetitors()]);
  const first = Object.keys(PROJECTS)[0];
  state.projectId = first || null;
  state.helpOpen = !first; // nothing tracked yet -> show how to add products straight away
  applyRoute();          // #/projects (the default) shows the project list, #/project/<id> opens one project
  window.addEventListener("hashchange", () => { applyRoute(); renderPage(); });
  renderPage();
}

// "+ Add products & keywords" and "+ Add keyword": straight to the Google Sheet (docs/settings.json -> sheet_url), opened in
// a new tab. Without a sheet link they stay buttons that open the how-to panel.
// ---------- Projects page (#/projects): every project of the sheet as a card or a row ----------
// Pictures, tags and notes come from the sheet via docs/data/config.json: an optional Projects tab (one row per project: project, image, tags, note),
// or the columns project_image / project_tags / project_note on the Products or Keywords tab. Without a picture the page looks for
// docs/images/projects/<project id>.jpg, then shows a coloured badge.
const PJ = { cache: {}, basis: null, opened: {}, filterOpen: false, modalOpen: false, blob: null, bound: false };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the choice lasts for this visit only */ } }
try { PJ.opened = JSON.parse(lsGet("rt_opened", "{}")) || {}; } catch (e) { PJ.opened = {}; }
Object.assign(state, { page: "projects", pq: "", pview: lsGet("rt_pview", "grid") === "list" ? "list" : "grid", psort: lsGet("rt_psort", "opened"), pfmp: [], pftag: [] });

const plural = (n, one, many) => t(n === 1 ? one : many, { n });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
const hashOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
const NATURAL = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const PRODUCT_URL = {
  ebay: (id) => `https://www.ebay.de/itm/${encodeURIComponent(id)}`, kaufland: (id) => `https://www.kaufland.de/product/${encodeURIComponent(id)}/`,
  temu: (id) => `https://www.temu.com/goods.html?goods_id=${encodeURIComponent(id)}`,
};

// ----- where the page is: #/projects (the list) or #/project/<id> (one project's tracker)
function markOpened(id) { PJ.opened[id] = Date.now(); lsSet("rt_opened", JSON.stringify(PJ.opened)); }
function applyRoute() {
  const raw = (location.hash || "").replace(/^#\/?/, "");
  const m = raw.match(/^project\/([^/?#]+)/);
  let id = ""; if (m) { try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; } }
  if (id && PROJECTS[id]) {
    state.page = "tracker";
    if (state.projectId !== id) { state.projectId = id; state.marketplace = null; state.itemKey = null; }
    markOpened(id);
  } else state.page = "projects";
}
function go(hash) { if (location.hash === hash) { applyRoute(); renderPage(); } else location.hash = hash; }

// ----- the data behind a card
function cleanImageJS(v) {
  v = String(v || "").trim();
  if (!v) return "";
  const d = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{10,})/);
  if (d) return `https://drive.google.com/thumbnail?id=${d[1]}&sz=w800`;
  if (/^https?:\/\/[^\s<>"']+$/i.test(v)) return v;
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp|gif|svg)$/i.test(v)) return "images/projects/" + v;
  return "";
}
function safeImg(u) { return /^https?:\/\/[^\s<>"']+$/i.test(u) || (/^images\/[A-Za-z0-9._\/-]+$/.test(u) && !u.includes("..")) ? u : ""; }

function decorateProject(e) {
  const p = e.p;
  const items = e.cfgItems.length
    ? e.cfgItems
    : p ? Object.values(p.items).filter((i) => !i.synthetic).map((i) => ({ item_key: i.item_key, marketplace: i.marketplace, country: i.country, product_id: i.product_id, sku: i.sku || "", label: i.label || "", keywords: uniq(i.rows.map((r) => r.keyword)) })) : [];
  const mps = [...MP_ORDER.filter((m) => items.some((i) => i.marketplace === m)), ...uniq(items.map((i) => i.marketplace)).filter((m) => !MP_ORDER.includes(m))];
  const kwMps = {};
  items.forEach((i) => (i.keywords || []).forEach((k) => ((kwMps[k] = kwMps[k] || new Set()).add(i.marketplace))));
  const stats = mps.map((m) => (p ? mpStats(p, m) : {
    mp: m, hasData: false, products: items.filter((i) => i.marketplace === m).length,
    keywords: uniq(items.filter((i) => i.marketplace === m).flatMap((i) => i.keywords || [])).length,
  }));
  const withData = stats.filter((s) => s.hasData);
  const total = withData.reduce((a, s) => a + s.total, 0), found = withData.reduce((a, s) => a + (s.vis * s.total) / 100, 0);
  const sorted = [...items].sort((a, b) => MP_ORDER.indexOf(a.marketplace) - MP_ORDER.indexOf(b.marketplace) || NATURAL(a.sku || "", b.sku || "") || NATURAL(String(a.product_id), String(b.product_id)));
  return Object.assign(e, {
    items: sorted, mps, stats, kwMps, keywordList: Object.keys(kwMps), products: items.length, keywords: Object.keys(kwMps).length,
    top10: withData.reduce((a, s) => a + s.top10, 0), total, vis: total ? (found / total) * 100 : null,
    checked: stats.map((s) => s.checked).filter(Boolean).sort().pop() || "", blocked: stats.reduce((a, s) => a + (s.blocked || 0), 0),
    hay: foldText([e.name, e.tags.join(" "), e.note, mps.map((m) => `${MP_LABEL[m] || m} ${(MP_SITE[m] || {}).domain || ""}`).join(" "),
      items.map((i) => `${i.product_id} ${i.sku || ""} ${i.label || ""}`).join(" "), Object.keys(kwMps).join(" ")].join(" ")),
  });
}

function projectList() {
  if (PJ.basis !== state.basis) { PJ.cache = {}; PJ.basis = state.basis; }
  const byId = {};
  ((CONFIG && CONFIG.projects) || []).forEach((cp) => { byId[cp.project_id] = { id: cp.project_id, name: cp.project_name, image: cp.image || "", tags: cp.tags || [], note: cp.note || "", cfgItems: cp.items || [], p: null }; });
  Object.values(PROJECTS).forEach((p) => { (byId[p.project_id] = byId[p.project_id] || { id: p.project_id, name: p.project_name, image: "", tags: [], note: "", cfgItems: [], p: null }).p = p; });
  return Object.values(byId).map((e) => { const k = state.basis + "|" + e.id; return PJ.cache[k] || (PJ.cache[k] = decorateProject(e)); });
}

function pjVisible(list) {
  const q = foldText(state.pq.trim());
  const out = list.filter((e) => (!q || e.hay.includes(q)) && (!state.pfmp.length || e.mps.some((m) => state.pfmp.includes(m))) && (!state.pftag.length || e.tags.some((x) => state.pftag.includes(x))));
  const by = {
    opened: (a, b) => (PJ.opened[b.id] || 0) - (PJ.opened[a.id] || 0) || NATURAL(a.name, b.name),
    name: (a, b) => NATURAL(a.name, b.name),
    checked: (a, b) => String(b.checked).localeCompare(String(a.checked)) || NATURAL(a.name, b.name),
    vis: (a, b) => (b.vis ?? -1) - (a.vis ?? -1) || NATURAL(a.name, b.name),
    kw: (a, b) => b.keywords - a.keywords || NATURAL(a.name, b.name),
    prod: (a, b) => b.products - a.products || NATURAL(a.name, b.name),
  };
  return out.sort(by[state.psort] || by.opened);
}

// ----- small pieces
const pjInitials = (name) => { const first = String(name).trim().split(/[\s(]+/).filter(Boolean)[0] || "?"; return first.slice(0, /\d/.test(first) || first === first.toUpperCase() ? 3 : 2).toUpperCase(); };
function pjThumbHTML(e) {
  const fresh = PJ.fresh && PJ.fresh[e.id], conv = `images/projects/${e.id}.jpg`, sheet = safeImg(e.image);
  const src = fresh || conv, fb = fresh || !sheet || sheet === conv ? "" : sheet;     // picture saved in the tool > file named after the project > the sheet's address
  return `<div class="pj-ph" style="--h:${hashOf(e.id) % 360}">${esc(pjInitials(e.name))}</div><img class="pj-img" src="${esc(src)}"${fb ? ` data-fb="${esc(fb)}"` : ""} alt="" loading="lazy" referrerpolicy="no-referrer" />`;
}
function pjImgFailed(im) { const fb = im.dataset.fb; if (fb) { delete im.dataset.fb; im.src = fb; } else im.remove(); }
function pjTagHTML(tag) {
  const k = tag.toLowerCase(), cls = /key/.test(k) ? "t-red" : /new|neu/.test(k) ? "t-amber" : "t-" + (hashOf(k) % 5);
  return `<span class="pj-tag ${cls}">${esc(tag)}</span>`;
}
function pjMarketsHTML(e) {
  return e.stats.map((s) => {
    const site = (MP_SITE[s.mp] || {}).domain || MP_LABEL[s.mp] || s.mp;
    const tip = [site, plural(s.products, "mpProduct", "mpProducts") + " | " + plural(s.keywords, "mpKeyword", "mpKeywords")]
      .concat(s.hasData ? [t("mpVis", { v: pct(s.vis, 1) }), t("mpTop10", { a: s.top10, b: s.total })] : [t("mpNoData")]).join(" · ");
    return `<span class="pj-mp" title="${esc(tip)}">${mpLogoHTML(s.mp)}${s.hasData ? `<b>${Math.round(s.vis)}%</b>` : ""}${s.blocked ? `<i class="pj-warn" title="${esc(t("blockedTip"))}">${s.blocked}</i>` : ""}</span>`;
  }).join("");
}
const pjWhen = (iso) => new Date(iso).toLocaleString(LOCALE(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
function pjMenuHTML(e) {
  const sheet = SETTINGS.sheet_url ? `<a class="pj-menu-item" role="menuitem" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener">${esc(t("pjOpenSheet"))}</a>` : "";
  return `<div class="pj-menu" role="menu" hidden>
    ${e.p ? `<button type="button" class="pj-menu-item" role="menuitem" data-act="open">${esc(t("pjMenuOpen"))}</button>` : ""}
    <button type="button" class="pj-menu-item" role="menuitem" data-act="details">${esc(t("pjMenuDetails"))}</button>
    <button type="button" class="pj-menu-item" role="menuitem" data-act="edit">${esc(t("pjMenuEdit"))}</button>
    <button type="button" class="pj-menu-item" role="menuitem" data-act="ids">${esc(t("pjMenuIds"))}</button>
    <button type="button" class="pj-menu-item" role="menuitem" data-act="kw">${esc(t("pjMenuKw"))}</button>${sheet}</div>`;
}
function pjCardHTML(e) {
  const on = !!e.p;
  return `<article class="pj-card ${on ? "" : "off"}" data-id="${esc(e.id)}" ${on ? `tabindex="0" role="link"` : `aria-disabled="true"`} aria-label="${esc(e.name)}">
    <div class="pj-imgbox">${pjThumbHTML(e)}<button type="button" class="pj-more" aria-label="${esc(t("pjMore"))}" aria-haspopup="menu" aria-expanded="false">⋯</button>${pjMenuHTML(e)}</div>
    <div class="pj-body">
      <h3 class="pj-name">${esc(e.name)}</h3>
      <div class="pj-markets">${pjMarketsHTML(e)}</div>
      <div class="mp-counts">${esc(plural(e.products, "mpProduct", "mpProducts"))}<span class="mp-sep" aria-hidden="true"></span>${esc(plural(e.keywords, "mpKeyword", "mpKeywords"))}</div>
      ${on && e.total ? `<div class="mp-chips"><span class="mp-chip">${esc(t("mpTop10", { a: e.top10, b: e.total }))}</span><span class="mp-chip">${esc(t("mpVis", { v: pct(e.vis, 1) }))}</span></div>` : ""}
      ${on ? "" : `<div class="pj-wait">${esc(t("pjWaiting"))}</div>`}
      ${e.tags.length ? `<div class="pj-tags">${e.tags.map(pjTagHTML).join("")}</div>` : ""}
      ${e.note ? `<p class="pj-note">${esc(e.note)}</p>` : ""}
      ${e.checked ? `<div class="mp-foot">${esc(t("pjLast", { when: pjWhen(e.checked) }))}${e.blocked ? `<span class="mp-warn" title="${esc(t("blockedTip"))}">${esc(t("mpBlocked", { n: e.blocked }))}</span>` : ""}</div>` : ""}
    </div></article>`;
}
function pjListHTML(list) {
  const head = ["pjColProject", "pjColMarkets", "pjColProducts", "pjColKeywords", "pjColTop10", "pjColVis", "pjColChecked", "pjColTags"].map((k) => `<th>${esc(t(k))}</th>`).join("");
  const rows = list.map((e) => {
    const on = !!e.p;
    return `<tr class="pj-row ${on ? "" : "off"}" data-id="${esc(e.id)}" ${on ? `tabindex="0" role="link"` : `aria-disabled="true"`}>
      <td><div class="pj-rowname"><div class="pj-imgbox sm">${pjThumbHTML(e)}</div><div><b>${esc(e.name)}</b>${e.note ? `<div class="pj-note">${esc(e.note)}</div>` : ""}</div></div></td>
      <td><div class="pj-markets">${pjMarketsHTML(e)}</div></td><td>${e.products}</td><td>${e.keywords}</td>
      <td>${on && e.total ? `${e.top10} / ${e.total}` : "–"}</td><td>${on && e.total ? pct(e.vis, 1) : "–"}</td>
      <td>${e.checked ? esc(pjWhen(e.checked)) : esc(t("pjWaitingShort"))}</td>
      <td><div class="pj-tags">${e.tags.map(pjTagHTML).join("")}</div></td>
      <td class="pj-rowmenu"><div class="pj-menuhost"><button type="button" class="pj-more" aria-label="${esc(t("pjMore"))}" aria-haspopup="menu" aria-expanded="false">⋯</button>${pjMenuHTML(e)}</div></td></tr>`;
  }).join("");
  return `<div class="grid-wrap"><table class="pj-table"><thead><tr>${head}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ----- the page
function pjFilterHTML(allMps, allTags) {
  const mps = allMps.map((m) => `<label class="pj-check"><input type="checkbox" data-fmp="${esc(m)}" ${state.pfmp.includes(m) ? "checked" : ""} /> <span class="mp-logo-box sm">${mpLogoHTML(m)}</span> ${esc(MP_LABEL[m] || m)}</label>`).join("");
  const tags = allTags.length ? allTags.map((x) => `<label class="pj-check"><input type="checkbox" data-ftag="${esc(x)}" ${state.pftag.includes(x) ? "checked" : ""} /> ${pjTagHTML(x)}</label>`).join("") : `<div class="pj-nodata">${esc(t("pjNoTags"))}</div>`;
  return `<div class="pj-fgroup">${esc(t("pjFilterMp"))}</div>${mps}<div class="pj-fgroup">${esc(t("pjFilterTag"))}</div>${tags}<button type="button" class="pj-clear" id="pjFilterClear">${esc(t("pjFilterClear"))}</button>`;
}
function renderProjectsPage(demoBanner) {
  const app = document.getElementById("app");
  const list = projectList();
  const allMps = MP_ORDER.filter((m) => list.some((e) => e.mps.includes(m))).concat(uniq(list.flatMap((e) => e.mps)).filter((m) => !MP_ORDER.includes(m)));
  const allTags = uniq(list.flatMap((e) => e.tags)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const last = list.map((e) => e.checked).filter(Boolean).sort().pop();
  const nFilters = state.pfmp.length + state.pftag.length;
  const sortOpts = [["opened", "pjSortOpened"], ["name", "pjSortName"], ["checked", "pjSortChecked"], ["vis", "pjSortVis"], ["kw", "pjSortKw"], ["prod", "pjSortProd"]]
    .map(([v, k]) => `<option value="${v}" ${state.psort === v ? "selected" : ""}>${esc(t(k))}</option>`).join("");
  app.innerHTML = `
    ${demoBanner}
    <div class="topbar"><img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" /><h1>Rank Tracker</h1><div class="spacer"></div>${langToggleHTML()}${last ? `<span class="updated">${esc(t("lastChecked"))} ${esc(new Date(last).toLocaleString(LOCALE()))}</span>` : ""}</div>
    <div class="content pj-page">
      <div class="pj-head"><h2 class="pj-title">${esc(t("pjTitle"))}</h2>
        <div class="pj-counters"><span><b>${list.length}</b> ${esc(t("pjCntProjects"))}</span><span><b>${list.reduce((a, e) => a + e.products, 0)}</b> ${esc(t("pjCntProducts"))}</span><span><b>${uniq(list.flatMap((e) => e.keywordList)).length}</b> ${esc(t("pjCntKeywords"))}</span></div></div>
      <div class="pj-search"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input type="search" id="pjSearch" placeholder="${esc(t("pjSearchPh"))}" value="${esc(state.pq)}" autocomplete="off" spellcheck="false" aria-label="${esc(t("pjSearchPh"))}" /></div>
      <div class="pj-toolbar">
        <button type="button" class="btn primary" id="pjCreate">+ ${esc(t("pjCreate"))}</button><div class="spacer"></div>
        <div class="pj-filter-wrap"><button type="button" class="btn" id="pjFilterBtn" aria-haspopup="true" aria-expanded="${PJ.filterOpen}">${esc(t("pjFilters"))}${nFilters ? ` <span class="mp-plus">${nFilters}</span>` : ""} ▾</button>
          <div class="pj-filter-pop" id="pjFilterPop" ${PJ.filterOpen ? "" : "hidden"}>${pjFilterHTML(allMps, allTags)}</div></div>
        <label class="pj-sort"><span>${esc(t("pjSortBy"))}</span><select id="pjSort">${sortOpts}</select></label>
        ${SETTINGS.sheet_url ? `<a class="btn" id="pjSheet" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener">${esc(t("pjOpenSheet"))}</a>` : ""}
        <div class="pj-viewtoggle" role="group"><button type="button" data-pview="grid" class="${state.pview === "grid" ? "active" : ""}" aria-label="${esc(t("pjGrid"))}" title="${esc(t("pjGrid"))}">▦</button><button type="button" data-pview="list" class="${state.pview === "list" ? "active" : ""}" aria-label="${esc(t("pjListView"))}" title="${esc(t("pjListView"))}">☰</button></div>
      </div>
      <div class="pj-count" id="pjCount"></div>
      <div id="pjBody"></div>
      <div class="version-note">${esc(t("versionNote"))} ${APP_VERSION}</div>
    </div>`;
  bindLangToggle();
  bindProjectsPage(allMps, allTags);
  renderProjectsBody();
}
function renderProjectsBody() {
  const body = document.getElementById("pjBody"); if (!body) return;
  const all = projectList(), shown = pjVisible(all);
  document.getElementById("pjCount").textContent = shown.length === all.length ? "" : t("pjShowing", { a: shown.length, b: all.length });
  body.innerHTML = !shown.length ? `<div class="empty-state">${esc(t("pjNone"))}</div>` : state.pview === "list" ? pjListHTML(shown) : `<div class="pj-grid">${shown.map(pjCardHTML).join("")}</div>`;
}
function closePjMenus() {
  document.querySelectorAll(".pj-menu").forEach((m) => { m.hidden = true; });
  document.querySelectorAll(".pj-more").forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function closePjFilter() {
  const pop = document.getElementById("pjFilterPop"), btn = document.getElementById("pjFilterBtn");
  PJ.filterOpen = false; if (pop) pop.hidden = true; if (btn) btn.setAttribute("aria-expanded", "false");
}
function pjIds(e) { return e.items.map((i) => [i.marketplace, i.product_id, i.sku || ""].join("\t")).join("\n"); }
async function pjCopy(text) { pjToast((await copyText(text)) ? t("pjCopied") : t("pjCopyFailed")); }
function pjToast(msg) {
  let el = document.getElementById("pjToast");
  if (!el) { el = document.createElement("div"); el.id = "pjToast"; el.className = "pj-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show"); clearTimeout(pjToast.t); pjToast.t = setTimeout(() => el.classList.remove("show"), 2400);
}
function pjAction(act, id) {
  const e = projectList().find((x) => x.id === id); if (!e) return;
  if (act === "open") go("#/project/" + encodeURIComponent(id));
  else if (act === "details") openPjDetails(id);
  else if (act === "edit") openPjEdit(id);
  else if (act === "ids") pjCopy(pjIds(e));
  else if (act === "kw") pjCopy(e.keywordList.join("\n"));
}
function bindProjectsPage() {
  const $ = (id) => document.getElementById(id);
  $("pjSearch").addEventListener("input", (ev) => { state.pq = ev.target.value; renderProjectsBody(); });
  $("pjSort").addEventListener("change", (ev) => { state.psort = ev.target.value; lsSet("rt_psort", state.psort); renderProjectsBody(); });
  $("pjCreate").addEventListener("click", () => openPjCreate());
  document.querySelectorAll("[data-pview]").forEach((b) => b.addEventListener("click", () => {
    state.pview = b.dataset.pview; lsSet("rt_pview", state.pview);
    document.querySelectorAll("[data-pview]").forEach((x) => x.classList.toggle("active", x === b)); renderProjectsBody();
  }));
  $("pjFilterBtn").addEventListener("click", (ev) => { ev.stopPropagation(); const open = !PJ.filterOpen; PJ.filterOpen = open; $("pjFilterPop").hidden = !open; ev.currentTarget.setAttribute("aria-expanded", String(open)); });
  $("pjFilterPop").addEventListener("click", (ev) => ev.stopPropagation());
  const refreshFilterBtn = () => {
    const n = state.pfmp.length + state.pftag.length, b = $("pjFilterBtn");
    b.innerHTML = `${esc(t("pjFilters"))}${n ? ` <span class="mp-plus">${n}</span>` : ""} ▾`;
  };
  $("pjFilterPop").addEventListener("change", (ev) => {
    const el = ev.target, key = el.dataset.fmp ? "pfmp" : el.dataset.ftag !== undefined ? "pftag" : null; if (!key) return;
    const v = el.dataset.fmp || el.dataset.ftag; state[key] = el.checked ? uniq([...state[key], v]) : state[key].filter((x) => x !== v);
    refreshFilterBtn(); renderProjectsBody();
  });
  $("pjFilterClear").addEventListener("click", () => { state.pfmp = []; state.pftag = []; $("pjFilterPop").querySelectorAll("input").forEach((i) => { i.checked = false; }); refreshFilterBtn(); renderProjectsBody(); });
  const body = $("pjBody");
  const openCard = (el) => { const row = el.closest("[data-id]"); if (row && !row.classList.contains("off")) go("#/project/" + encodeURIComponent(row.dataset.id)); };
  body.addEventListener("click", (ev) => {
    const more = ev.target.closest(".pj-more");
    if (more) {
      ev.stopPropagation();
      const menu = more.parentElement.querySelector(".pj-menu"), open = menu.hidden; closePjMenus(); menu.hidden = !open; more.setAttribute("aria-expanded", String(open)); return;
    }
    const item = ev.target.closest(".pj-menu-item");
    if (item) { if (item.tagName === "A") { closePjMenus(); return; } const id = item.closest("[data-id]").dataset.id; closePjMenus(); pjAction(item.dataset.act, id); return; }
    if (ev.target.closest("a")) return;
    openCard(ev.target);
  });
  body.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[data-id][role='link']")) { ev.preventDefault(); openCard(ev.target); } });
  body.addEventListener("load", (ev) => { const im = ev.target; if (im.classList && im.classList.contains("pj-img")) { im.classList.add("ok"); im.parentElement.classList.add("has-img"); } }, true);
  body.addEventListener("error", (ev) => { const im = ev.target; if (im.classList && im.classList.contains("pj-img")) pjImgFailed(im); }, true);
  if (!PJ.bound) {
    PJ.bound = true;
    document.addEventListener("click", () => { closePjMenus(); closePjFilter(); });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (PJ.modalOpen) closePjModal(); else { closePjMenus(); closePjFilter(); }
    });
  }
}

// ----- windows (details, picture editor, create project)
function openPjModal(title, bodyHTML) {
  const old = document.getElementById("pjModal"); if (old) old.remove();
  if (PJ.blob) { URL.revokeObjectURL(PJ.blob); PJ.blob = null; }
  const r = document.createElement("div"); r.id = "pjModal"; r.className = "pj-modal"; document.body.appendChild(r);
  r.innerHTML = `<div class="pj-backdrop" data-close></div><div class="pj-dialog" role="dialog" aria-modal="true" aria-labelledby="pjDlgTitle" tabindex="-1">
    <div class="pj-dlg-head"><h2 id="pjDlgTitle">${esc(title)}</h2><button type="button" class="pj-x" data-close aria-label="${esc(t("pjClose"))}">✕</button></div><div class="pj-dlg-body">${bodyHTML}</div></div>`;
  PJ.modalOpen = true; document.body.classList.add("modal-open");
  r.onclick = (ev) => { if (ev.target.closest("[data-close]")) closePjModal(); const c = ev.target.closest("[data-copy]"); if (c) pjCopy(c.dataset.copy); };
  // pictures inside a window: shown when they load, dropped (the badge stays) when they cannot be found, as on the cards
  r.addEventListener("load", (ev) => { const im = ev.target; if (im.classList && im.classList.contains("pj-img")) { im.classList.add("ok"); im.parentElement.classList.add("has-img"); } }, true);
  r.addEventListener("error", (ev) => { const im = ev.target; if (im.classList && im.classList.contains("pj-img")) pjImgFailed(im); }, true);
  r.querySelector(".pj-dialog").focus();
  return r;
}
function closePjModal() {
  const r = document.getElementById("pjModal"); if (!r) return;
  r.remove(); PJ.modalOpen = false; document.body.classList.remove("modal-open");
  if (PJ.blob) { URL.revokeObjectURL(PJ.blob); PJ.blob = null; }
}
function pjHeadHTML(e) {
  return `<div class="pj-dlg-proj"><div class="pj-imgbox sm">${pjThumbHTML(e)}</div><div><b>${esc(e.name)}</b>${e.tags.length ? `<div class="pj-tags">${e.tags.map(pjTagHTML).join("")}</div>` : ""}${e.note ? `<div class="pj-note">${esc(e.note)}</div>` : ""}</div></div>`;
}
function openPjDetails(id, tab = "products") {
  const e = projectList().find((x) => x.id === id); if (!e) return;
  const prodRows = e.items.map((i) => {
    const url = PRODUCT_URL[i.marketplace] ? PRODUCT_URL[i.marketplace](i.product_id) : "";
    return `<tr><td><span class="pj-mp">${mpLogoHTML(i.marketplace)}</span></td><td>${esc(i.sku || "–")}</td><td><code>${esc(i.product_id)}</code> <button type="button" class="pj-copy" data-copy="${esc(i.product_id)}" title="${esc(t("pjCopyIdsBtn"))}">⧉</button></td><td>${esc(i.label || "")}</td>
      <td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(t("pjOpenListing"))}">↗</a>` : ""}</td></tr>`;
  }).join("");
  const kwRows = e.keywordList.map((k) => {
    const where = [...e.kwMps[k]], all = where.length === e.mps.length;
    return `<li><span>${esc(k)}</span>${all ? "" : `<span class="pj-kw-only" title="${esc(t("pjOnlyOn", { mps: where.map((m) => MP_LABEL[m] || m).join(", ") }))}">${where.map((m) => `<span class="pj-mp">${mpLogoHTML(m)}</span>`).join("")}</span>`}</li>`;
  }).join("");
  const r = openPjModal(t("pjDetails"), `${pjHeadHTML(e)}
    <div class="pj-tabs" role="tablist"><button type="button" role="tab" data-tab="products" class="${tab === "products" ? "active" : ""}">${esc(t("pjTabProducts"))} (${e.products})</button><button type="button" role="tab" data-tab="keywords" class="${tab === "keywords" ? "active" : ""}">${esc(t("pjTabKeywords"))} (${e.keywords})</button></div>
    <div class="pj-pane" data-pane="products" ${tab === "products" ? "" : "hidden"}><div class="grid-wrap"><table class="pj-table sm"><thead><tr><th>${esc(t("pjColMp"))}</th><th>${esc(t("pjColSku"))}</th><th>${esc(t("pjColId"))}</th><th>${esc(t("pjColName"))}</th><th></th></tr></thead><tbody>${prodRows}</tbody></table></div></div>
    <div class="pj-pane" data-pane="keywords" ${tab === "keywords" ? "" : "hidden"}><ul class="pj-kw">${kwRows}</ul></div>
    <div class="pj-actions"><button type="button" class="btn" data-copy="${esc(pjIds(e))}">${esc(t("pjCopyIdsBtn"))}</button><button type="button" class="btn" data-copy="${esc(e.keywordList.join("\n"))}">${esc(t("pjCopyKwBtn"))}</button>
      <button type="button" class="btn" id="pjDetEdit">${esc(t("pjMenuEdit"))}</button>${e.p ? `<button type="button" class="btn primary" id="pjDetOpen">${esc(t("pjMenuOpen"))}</button>` : ""}</div>`);
  r.querySelectorAll(".pj-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
    r.querySelectorAll(".pj-tabs [data-tab]").forEach((x) => x.classList.toggle("active", x === b));
    r.querySelectorAll(".pj-pane").forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));
  const edit = r.querySelector("#pjDetEdit"); if (edit) edit.addEventListener("click", () => openPjEdit(id));
  const open = r.querySelector("#pjDetOpen"); if (open) open.addEventListener("click", () => { closePjModal(); go("#/project/" + encodeURIComponent(id)); });
}

// ----- saving a project picture from the dashboard: one small file is committed into the GitHub repository (docs/images/projects/<id>.jpg)
// with a fine-grained personal access token that the person creates once; it stays in this browser (localStorage) and is only ever sent to api.github.com.
const GH_TOKEN_KEY = "rt_gh_token";
PJ.fresh = {};   // project id -> data URL of a picture saved in this session: shown at once, while GitHub Pages is still publishing it
try {
  const saved = JSON.parse(sessionStorage.getItem("rt_fresh") || "{}") || {};
  Object.keys(saved).forEach((k) => { if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(saved[k])) PJ.fresh[k] = saved[k]; });
} catch (e) { PJ.fresh = {}; }
function rememberFresh() { try { sessionStorage.setItem("rt_fresh", JSON.stringify(PJ.fresh)); } catch (e) { /* too big or blocked: the picture shows after publishing */ } }

function ghTarget() {
  let repo = String(SETTINGS.github_repo || "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {            // a GitHub Pages address https://<owner>.github.io/<repo>/ names the repository
    const host = location.hostname.match(/^([\w-]+)\.github\.io$/i), seg = location.pathname.split("/").filter(Boolean)[0];
    repo = host && seg ? `${host[1]}/${seg}` : "";
  }
  return { repo, owner: repo.split("/")[0] || "", branch: String(SETTINGS.github_branch || "main"), dir: String(SETTINGS.github_docs_dir === undefined ? "docs" : SETTINGS.github_docs_dir).replace(/^\/+|\/+$/g, "") };
}
const ghToken = () => lsGet(GH_TOKEN_KEY, "");
async function ghApi(method, path, token, body) {
  const res = await fetch("https://api.github.com" + path, {
    method, headers: Object.assign({ Authorization: "Bearer " + token, Accept: "application/vnd.github+json" }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) { /* no JSON body */ }
  return { status: res.status, ok: res.ok, data };
}
async function ghCheck(token) {
  if (!ghTarget().repo) return { ok: false, why: "norepo" };
  try {
    const r = await ghApi("GET", "/user", token);
    if (r.status === 401) return { ok: false, why: "bad" };
    if (!r.ok) return { ok: false, why: "http", status: r.status, message: (r.data && r.data.message) || "" };
    return { ok: true, login: (r.data && r.data.login) || "" };
  } catch (e) { return { ok: false, why: "net" }; }
}
function blobToBase64(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
async function ghSavePicture(id, blob, token) {
  const { repo, branch, dir } = ghTarget();
  if (!repo) return { ok: false, why: "norepo" };
  const path = `${dir ? dir + "/" : ""}images/projects/${id}.jpg`, api = `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const content = await blobToBase64(blob);
    for (let attempt = 1; attempt <= 2; attempt++) {           // a second look if the file changed while we were saving
      const cur = await ghApi("GET", `${api}?ref=${encodeURIComponent(branch)}`, token);
      if (cur.status === 401) return { ok: false, why: "bad" };
      const sha = cur.status === 200 && cur.data && cur.data.sha ? cur.data.sha : undefined;   // replacing a picture needs the old file's sha
      const put = await ghApi("PUT", api, token, Object.assign({ message: `${sha ? "Replace" : "Add"} picture for project ${id}`, content, branch }, sha ? { sha } : {}));
      if (put.ok) return { ok: true, dataUrl: `data:image/jpeg;base64,${content}` };
      if (put.status === 409 || put.status === 422) continue;
      const why = put.status === 401 ? "bad" : put.status === 403 ? "forbidden" : put.status === 404 ? "noaccess" : "http";
      return { ok: false, why, status: put.status, message: (put.data && put.data.message) || "" };
    }
    return { ok: false, why: "conflict" };
  } catch (e) { return { ok: false, why: "net" }; }
}
function ghErrorText(r) {
  const { repo } = ghTarget(), msg = r.message ? String(r.message).slice(0, 160) : "";
  switch (r.why) {
    case "bad": return t("pjGhErrBad");
    case "net": return t("pjGhErrNet");
    case "norepo": return t("pjGhNoRepo");
    case "forbidden": return t("pjGhErrForbidden", { repo, message: msg });
    case "noaccess": return t("pjGhErrNoAccess", { repo });
    case "conflict": return t("pjGhErrConflict");
    default: return t("pjGhErrHttp", { status: r.status || "?", message: msg });
  }
}

function pjPicWidgetHTML() {
  return `<div class="pj-pic" id="pjw">
    <label class="pj-field"><span>${esc(t("pjPicFile"))}</span><input type="file" id="pjwFile" accept="image/*" /></label>
    <div class="pj-bad" id="pjwNoResize" hidden></div>
    <div class="pj-dl" id="pjwActions" hidden>
      <div class="pj-actions"><button type="button" class="btn primary" id="pjwSave"></button><a class="btn" id="pjwDl"></a></div>
      <p class="pj-help" id="pjwHow"></p>
    </div>
    <div class="pj-msg" id="pjwStatus" role="status" hidden></div>
    <details class="pj-gh" id="pjwGh"><summary id="pjwGhSum"></summary><div id="pjwGhBody"></div></details>
  </div>`;
}
// getId(): the project id the picture is saved under ("" when not known yet). hooks.onBlob(): a picture was chosen; hooks.onSaved(): it was saved.
function bindPicWidget(r, getId, hooks = {}) {
  const q = (s) => r.querySelector(s);
  let blob = null, busy = false;
  const status = (kind, text) => { const el = q("#pjwStatus"); el.hidden = !text; el.className = "pj-msg " + kind; el.textContent = text || ""; };
  function renderActions() {
    q("#pjwActions").hidden = !blob;
    if (!blob) return;
    const id = getId(), file = `${id || "…"}.jpg`, dl = q("#pjwDl"), save = q("#pjwSave");
    dl.download = file; dl.href = PJ.blob || "#"; dl.textContent = t("pjPicDownload", { file });
    save.textContent = busy ? t("pjPicSaving") : t("pjPicSave", { file }); save.disabled = busy || !id;
    q("#pjwHow").textContent = ghToken() ? "" : t("pjPicUpload");
  }
  function renderGh() {
    const tok = ghToken(), { repo, owner } = ghTarget(), body = q("#pjwGhBody");
    q("#pjwGhSum").textContent = t(tok ? "pjGhSummaryOn" : "pjGhSummaryOff");
    if (!repo) { body.innerHTML = `<p class="pj-help">${esc(t("pjGhNoRepo"))}</p>`; return; }
    if (tok) {
      body.innerHTML = `<p class="pj-help">${esc(t("pjGhIntroOn", { repo }))}</p><button type="button" class="pj-clear" id="pjwGhRemove">${esc(t("pjGhRemove"))}</button>`;
      q("#pjwGhRemove").addEventListener("click", () => { try { localStorage.removeItem(GH_TOKEN_KEY); } catch (e) { /* ignore */ } status("info", t("pjGhRemoved")); renderGh(); renderActions(); });
      return;
    }
    const link = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent("Rank Tracker pictures")}&description=${encodeURIComponent("Rank Tracker dashboard: project pictures")}&target_name=${encodeURIComponent(owner)}&expires_in=90&contents=write`;
    body.innerHTML = `<p class="pj-help">${esc(t("pjGhIntro"))}</p>
      <ol class="pj-steps"><li>${esc(t("pjGhS1"))} <a href="${esc(link)}" target="_blank" rel="noopener">${esc(t("pjGhS1Link"))}</a></li><li>${esc(t("pjGhS2", { repo }))}</li><li>${esc(t("pjGhS3"))}</li></ol>
      <div class="pj-token-row"><input type="password" id="pjwToken" placeholder="${esc(t("pjGhTokenPh"))}" autocomplete="off" spellcheck="false" /><button type="button" class="btn primary" id="pjwGhConnect">${esc(t("pjGhConnect"))}</button></div>
      <p class="pj-help">${esc(t("pjGhOrgNote"))}</p><p class="pj-help">${esc(t("pjGhRisk"))}</p>`;
    const go = async () => {
      const v = q("#pjwToken").value.trim(); if (!v) return;
      status("info", t("pjGhChecking"));
      const c = await ghCheck(v);
      if (!c.ok) { status("err", ghErrorText(c)); return; }
      lsSet(GH_TOKEN_KEY, v); status("ok", t("pjGhConnected", { login: c.login })); renderGh(); renderActions();
    };
    q("#pjwGhConnect").addEventListener("click", go);
    q("#pjwToken").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); go(); } });
  }
  q("#pjwFile").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    status("", "");
    const b = await resizeImageFile(f);
    if (PJ.blob) URL.revokeObjectURL(PJ.blob);
    blob = b; PJ.blob = b ? URL.createObjectURL(b) : null;
    const nr = q("#pjwNoResize"); nr.hidden = !!b; nr.textContent = b ? "" : t("pjPicNoResize", { file: `${getId() || "<project id>"}.jpg` });
    renderActions();
    if (b && hooks.onBlob) hooks.onBlob();
  });
  q("#pjwSave").addEventListener("click", async () => {
    const id = getId();
    if (!id) { status("err", t("pjPicNeedName")); return; }
    const tok = ghToken();
    if (!tok) { q("#pjwGh").open = true; status("err", t("pjPicNeedToken")); return; }
    busy = true; renderActions(); status("info", t("pjPicSaving"));
    const res = await ghSavePicture(id, blob, tok);
    busy = false; renderActions();
    if (!res.ok) { status("err", ghErrorText(res)); return; }
    PJ.fresh[id] = res.dataUrl; rememberFresh();
    status("ok", t("pjPicSaved", { repo: ghTarget().repo }));
    if (state.page === "projects") renderProjectsBody();     // the card shows the new picture at once
    if (hooks.onSaved) hooks.onSaved();
  });
  r.addEventListener("input", renderActions);               // the project name (create window) decides the file name
  renderGh(); renderActions();
}

async function resizeImageFile(file, maxW = 640, maxH = 480, quality = 0.86) {
  // a smaller JPEG (white background) so the repository stays small; null when this browser cannot do it
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxW / bmp.width, maxH / bmp.height), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    return await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", quality));
  } catch (err) { return null; }
}
function openPjEdit(id) {
  const e = projectList().find((x) => x.id === id); if (!e) return;
  const file = `${id}.jpg`;
  const r = openPjModal(t("pjEditTitle"), `${pjHeadHTML(e)}
    <label class="pj-field"><span>${esc(t("pjPicUrl"))}</span><input type="text" id="pjeUrl" placeholder="${esc(t("pjPicUrlPh"))}" value="${esc(/^https?:/.test(e.image) ? e.image : "")}" /></label>
    <div class="pj-bad" id="pjeBad" hidden>${esc(t("pjBadImage"))}</div>
    ${pjPicWidgetHTML()}
    <label class="pj-field"><span>${esc(t("pjTagsLabel"))}</span><input type="text" id="pjeTags" value="${esc(e.tags.join(", "))}" /></label>
    <label class="pj-field"><span>${esc(t("pjNoteLabel"))}</span><input type="text" id="pjeNote" maxlength="280" value="${esc(e.note)}" /></label>
    <div class="pj-out"><b>${esc(t("pjCells"))}</b><table class="pj-table sm"><tbody>
      <tr><td><code>project</code></td><td>${esc(e.name)}</td></tr><tr><td><code>image</code></td><td id="pjeCellImg"></td></tr><tr><td><code>tags</code></td><td id="pjeCellTags"></td></tr><tr><td><code>note</code></td><td id="pjeCellNote"></td></tr></tbody></table>
      <p class="pj-help">${esc(t("pjCellsHow"))}</p></div>
    <div class="pj-actions"><button type="button" class="btn primary" id="pjeCopy">${esc(t("pjCopyCells"))}</button>${SETTINGS.sheet_url ? `<a class="btn" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener">${esc(t("pjOpenSheet"))}</a>` : ""}</div>`);
  const q = (s) => r.querySelector(s), cell = () => ({ img: q("#pjeUrl").value.trim(), tags: q("#pjeTags").value.trim(), note: q("#pjeNote").value.trim() });
  const refresh = () => {
    const c = cell(), bad = c.img && !cleanImageJS(c.img);
    q("#pjeBad").hidden = !bad;
    q("#pjeCellImg").textContent = c.img || (PJ.blob || PJ.fresh[id] ? t("pjPicBlank", { file }) : "");
    q("#pjeCellTags").textContent = c.tags; q("#pjeCellNote").textContent = c.note;
    const src = !bad && c.img ? safeImg(cleanImageJS(c.img)) : PJ.blob || PJ.fresh[id] || "";
    const box = q(".pj-dlg-proj .pj-imgbox");
    if (src) {
      box.classList.remove("has-img");
      box.innerHTML = `<div class="pj-ph" style="--h:${hashOf(e.id) % 360}">${esc(pjInitials(e.name))}</div><img class="pj-img" src="${esc(src)}" alt="" />`;
      const im = box.querySelector("img"); im.onload = () => { im.classList.add("ok"); box.classList.add("has-img"); }; im.onerror = () => im.remove();
    }
  };
  r.addEventListener("input", refresh);
  bindPicWidget(r, () => id, { onBlob: () => { q("#pjeUrl").value = ""; refresh(); }, onSaved: () => refresh() });
  q("#pjeCopy").addEventListener("click", () => { const c = cell(); pjCopy([e.name, c.img, c.tags, c.note].join("\t")); });
  refresh();
}

// ----- create a project: turns a short form into rows to paste into the Products and Keywords tabs
const CREATE_MPS = ["ebay", "kaufland", "temu", "otto"];
const COST_PER_READ = { ebay: 0.0015, otto: 0.0015, kaufland: 0.003, temu: 0.0025 };   // USD per keyword and check (Kaufland reads 2 pages)
function parseMpScope(text) {
  const s = String(text || "").trim().toLowerCase(); if (!s) return { mps: null, unknown: [] };
  const mps = [], unknown = [];
  for (let tok of s.split(/[,;\/|\s]+/)) {
    tok = tok.split(".")[0]; if (!tok) continue;
    if (["all", "*", "alle"].includes(tok)) return { mps: null, unknown };
    (MP_ORDER.includes(tok) ? mps : unknown).push(tok);
  }
  return { mps, unknown };
}
function parseIdLines(text) {
  const out = [], seen = new Set(), dups = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const parts = line.split(/\t|,/).map((x) => x.trim()); if (!parts[0]) return;
    if (seen.has(parts[0])) { dups.push(parts[0]); return; }
    seen.add(parts[0]); out.push({ id: parts[0], sku: parts[1] || "", name: parts.slice(2).join(", ") });
  });
  return { rows: out, dups };
}
function pjBuildRows(v) {
  const warn = [], name = v.name.trim(), products = [], keywords = [];
  if (!name) warn.push(["err", t("pjNeedName")]);
  const img = v.image.trim(); if (img && !cleanImageJS(img)) warn.push(["err", t("pjBadImage")]);
  const chosen = CREATE_MPS.filter((m) => v.mps[m] !== undefined);
  if (!chosen.length) warn.push(["err", t("pjNeedMp")]);
  const idsPer = {}; let first = true;
  chosen.forEach((m) => {
    const { rows, dups } = parseIdLines(v.mps[m]); idsPer[m] = rows;
    dups.forEach((d) => warn.push(["warn", t("pjDup", { x: d })]));
    rows.forEach((r) => { products.push([name, m, v.country, r.id, r.sku, r.name, ""]); first = false; });
  });
  if (chosen.length && !products.length) warn.push(["err", t("pjNeedIds")]);
  const kwSeen = new Set(), perMp = Object.fromEntries(chosen.map((m) => [m, 0]));
  String(v.kw || "").split(/\r?\n/).forEach((line) => {
    const bar = line.indexOf("|"), kwRaw = bar === -1 ? line : line.slice(0, bar), scopeRaw = bar === -1 ? "" : line.slice(bar + 1);
    const kw = kwRaw.trim(); if (!kw || kwSeen.has(kw.toLowerCase())) return; kwSeen.add(kw.toLowerCase());
    const { mps, unknown } = parseMpScope(scopeRaw);
    unknown.forEach((x) => warn.push(["warn", t("pjUnknownMp", { x })]));
    if (mps && mps.length && !mps.some((m) => chosen.includes(m))) warn.push(["warn", t("pjKwNotSel", { kw, mps: mps.map((m) => MP_LABEL[m]).join(", ") })]);
    const hit = mps === null ? chosen : mps.filter((m) => chosen.includes(m));
    hit.forEach((m) => { if (idsPer[m] && idsPer[m].length) perMp[m]++; });
    keywords.push([name, kw, mps === null ? "" : mps.length ? mps.join(", ") : scopeRaw.trim()]);   // only unknown names typed: keep them, so the sheet loader reports them
  });
  if (!keywords.length) warn.push(["err", t("pjNeedKw")]);
  if (chosen.includes("otto")) warn.push(["warn", t("pjOttoWarn")]);
  if (name && projectList().some((p) => slug(p.name) === slug(name))) warn.push(["info", t("pjExists")]);
  const usd = chosen.reduce((a, m) => a + (idsPer[m] && idsPer[m].length ? perMp[m] * COST_PER_READ[m] * 30 : 0), 0);
  const projectRow = img || v.tags.trim() || v.note.trim() ? [name, img, v.tags.trim(), v.note.trim()] : null;   // one row for the optional Projects tab
  return { products, keywords, projectRow, warn, usd, ok: !warn.some((w) => w[0] === "err") };
}
const tsv = (rows) => rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
function openPjCreate() {
  const mpBox = CREATE_MPS.map((m) => `<div class="pj-cmp"><label class="pj-check"><input type="checkbox" data-cmp="${m}" /> <span class="mp-logo-box sm">${mpLogoHTML(m)}</span> ${esc(MP_LABEL[m])}</label>
    <div class="pj-ids" data-ids="${m}" hidden><span class="pj-help">${esc(t("pjIdsFor", { mp: MP_LABEL[m] }))}. ${esc(t("pjIdsHelp"))}</span><textarea rows="4" data-idsarea="${m}" spellcheck="false" placeholder="${m === "ebay" ? "186000000001, PP01, Round pool cover" : ""}"></textarea></div></div>`).join("");
  const countries = Object.keys(FLAGS).map((c) => `<option value="${c}" ${c === "DE" ? "selected" : ""}>${FLAGS[c]} ${c}</option>`).join("");
  const r = openPjModal(t("pjCreateTitle"), `
    <div class="pj-formgrid"><label class="pj-field"><span>${esc(t("pjName"))} *</span><input type="text" id="pjcName" placeholder="${esc(t("pjNamePh"))}" autocomplete="off" /></label>
      <label class="pj-field"><span>${esc(t("pjCountry"))}</span><select id="pjcCountry">${countries}</select></label></div>
    <label class="pj-field"><span>${esc(t("pjImageOpt"))}</span><input type="text" id="pjcImage" placeholder="${esc(t("pjPicUrlPh"))}" /></label>
    ${pjPicWidgetHTML()}
    <div class="pj-formgrid"><label class="pj-field"><span>${esc(t("pjTagsLabel"))}</span><input type="text" id="pjcTags" placeholder="Key Product, Tarpofix" /></label>
      <label class="pj-field"><span>${esc(t("pjNoteLabel"))}</span><input type="text" id="pjcNote" maxlength="280" /></label></div>
    <div class="pj-fgroup">${esc(t("pjMarketplaces"))}</div>${mpBox}
    <label class="pj-field"><span>${esc(t("pjKwLabel"))}</span><span class="pj-help">${esc(t("pjKwHelp"))}</span><textarea id="pjcKw" rows="6" spellcheck="false" placeholder="poolplane&#10;poolabdeckung rund | temu, kaufland"></textarea></label>
    <div id="pjcOut" class="pj-out"></div>`);
  const q = (s) => r.querySelector(s);
  const values = () => {
    const mps = {}; r.querySelectorAll("[data-cmp]").forEach((c) => { if (c.checked) mps[c.dataset.cmp] = (q(`[data-idsarea="${c.dataset.cmp}"]`) || {}).value || ""; });
    return { name: q("#pjcName").value, image: q("#pjcImage").value, tags: q("#pjcTags").value, note: q("#pjcNote").value, country: q("#pjcCountry").value, mps, kw: q("#pjcKw").value };
  };
  const draw = () => {
    const b = pjBuildRows(values()), more = (rows, n) => (rows.length > n ? `<tr><td colspan="10" class="pj-help">${esc(t("pjMoreRows", { n: rows.length - n }))}</td></tr>` : "");
    const table = (rows, n) => `<div class="grid-wrap"><table class="pj-table sm"><tbody>${rows.slice(0, n).map((x) => `<tr>${x.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}${more(rows, n)}</tbody></table></div>`;
    q("#pjcOut").innerHTML = `${b.warn.map(([k, m]) => `<div class="pj-msg ${k}">${esc(m)}</div>`).join("")}
      ${b.ok ? `<b>${esc(t("pjOutProducts"))} (${b.products.length})</b><div class="pj-help">${esc(t("pjHeaderRow"))} project, marketplace, country, product_id, sku, name, source</div>${table(b.products, 6)}
        <b>${esc(t("pjOutKeywords"))} (${b.keywords.length})</b><div class="pj-help">${esc(t("pjHeaderRow"))} project, keyword, marketplace</div>${table(b.keywords, 6)}
        ${b.projectRow ? `<b>${esc(t("pjOutProject"))}</b><div class="pj-help">${esc(t("pjHeaderRow"))} project, image, tags, note</div>${table([b.projectRow], 1)}<p class="pj-help">${esc(t("pjProjectsTabHow"))}</p>` : ""}
        <p class="pj-help">${esc(t("pjEstimate", { usd: "$" + nf(b.usd, 2) }))}</p><p class="pj-help">${esc(t("pjPasteHow"))}</p>
        <div class="pj-actions"><button type="button" class="btn primary" data-copy="${esc(tsv(b.products))}">${esc(t("pjCopyRowsProducts"))}</button><button type="button" class="btn primary" data-copy="${esc(tsv(b.keywords))}">${esc(t("pjCopyRowsKeywords"))}</button>${b.projectRow ? `<button type="button" class="btn primary" data-copy="${esc(tsv([b.projectRow]))}">${esc(t("pjCopyRowProject"))}</button>` : ""}
        ${SETTINGS.sheet_url ? `<a class="btn" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener">${esc(t("pjOpenSheet"))}</a>` : ""}</div>` : ""}`;
  };
  r.addEventListener("input", draw);
  bindPicWidget(r, () => { const n = q("#pjcName").value.trim(); return n ? slug(n) : ""; });
  r.addEventListener("change", (ev) => {
    const c = ev.target.closest && ev.target.closest("[data-cmp]");
    if (c) { q(`[data-ids="${c.dataset.cmp}"]`).hidden = !c.checked; draw(); }
  });
  draw();
  q("#pjcName").focus();
}

// ---------- Marketplace dropdown (logo + counts + the latest numbers of the Keyword Tracker, one card per marketplace) ----------
function mpLogoHTML(mp) {
  const label = MP_LABEL[mp] || mp;
  return MP_LOGO[mp]
    ? `<img src="${MP_LOGO[mp]}" alt="${esc(label)}" loading="lazy" />`
    : `<span class="mp-badge" aria-hidden="true">${esc(String(label).charAt(0).toUpperCase())}</span>`;   // no logo file: a neutral letter badge
}

// What the dropdown shows for one marketplace of the current project: how much is tracked (from the sheet) and the latest check.
function mpStats(project, mp) {
  const real = Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === mp);
  const cfg = CONFIG ? ((CONFIG.projects || []).find((p) => p.project_id === project.project_id) || {}).items || [] : [];
  const fromSheet = cfg.filter((i) => i.marketplace === mp);
  const products = (fromSheet.length ? fromSheet : real).length;
  const kw = new Set();
  (fromSheet.length ? fromSheet : real).forEach((i) => (i.keywords || []).forEach((k) => kw.add(k)));
  if (!kw.size) real.forEach((i) => i.rows.forEach((r) => kw.add(r.keyword)));
  const out = { mp, products, keywords: kw.size, hasData: false };
  const rows = real.length ? bestRows(project, mp, "__stats__:" + mp) : [];   // best rank per keyword and day; follows the all / organic switch
  if (!rows.length) return out;
  const S = computeSeries(rows), last = S.dates.length - 1;
  const latestDay = rows.map((r) => r.date).sort().pop();
  out.checked = rows.map((r) => r.checked_at || r.date).sort().pop();
  out.blocked = rows.filter((r) => r.date === latestDay && r.blocked).length;       // keywords Temu / the marketplace would not show us on the latest day
  if (last >= 0) {
    out.hasData = true;
    out.vis = S.vis[last]; out.avg = S.avg[last]; out.top10 = S.top10[last]; out.total = S.dist[last].reduce((a, b) => a + b, 0);
  }
  return out;
}

function mpPickerHTML(project, mps) {
  const stats = mps.map((m) => mpStats(project, m));
  const cur = state.marketplace, curName = MP_LABEL[cur] || cur;
  const linkTo = (cls, text, act) => SETTINGS.sheet_url
    ? `<a class="${cls}" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener" role="menuitem" data-act="${act}">${text}</a>`
    : `<button type="button" class="${cls}" role="menuitem" data-act="help">${text}</button>`;
  const when = (iso) => new Date(iso).toLocaleString(LOCALE(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const plural = (n, one, many) => t(n === 1 ? one : many, { n });
  const cards = stats.map((st) => {
    const m = st.mp, site = MP_SITE[m] || { domain: MP_LABEL[m] || m, url: "" }, sel = m === cur;
    const numbers = st.hasData
      ? `<div class="mp-bar" title="${esc(t("visTitle"))}"><i style="width:${Math.max(0, Math.min(100, st.vis)).toFixed(1)}%"></i></div>
         <div class="mp-chips"><span class="mp-chip">${esc(t("mpTop10", { a: st.top10, b: st.total }))}</span><span class="mp-chip">${esc(t("mpVis", { v: pct(st.vis, 1) }))}</span><span class="mp-chip">${esc(t("mpAvg", { v: st.avg === null ? "–" : nf(st.avg, 1) }))}</span></div>`
      : `<div class="mp-nodata">${esc(t("mpNoData"))}</div>`;
    const foot = st.checked ? `<div class="mp-foot">${esc(t("mpChecked", { when: when(st.checked) }))}${st.blocked ? `<span class="mp-warn" title="${esc(t("blockedTip"))}">${esc(t("mpBlocked", { n: st.blocked }))}</span>` : ""}</div>` : "";
    return `<div class="mp-card ${sel ? "sel" : ""}" role="option" id="mpOpt-${esc(m)}" data-mp="${esc(m)}" aria-selected="${sel}" tabindex="-1">
        <div class="mp-logo-box">${mpLogoHTML(m)}</div>
        <div class="mp-main">
          <div class="mp-title"><span class="mp-domain">${esc(site.domain)}</span>${sel ? `<span class="mp-check" aria-hidden="true">✓</span>` : ""}</div>
          <div class="mp-counts">${esc(plural(st.products, "mpProduct", "mpProducts"))}<span class="mp-sep" aria-hidden="true"></span>${esc(plural(st.keywords, "mpKeyword", "mpKeywords"))}</div>
          ${numbers}${foot}
        </div>
        <button type="button" class="mp-more" aria-label="${esc(t("mpMore"))}" aria-haspopup="menu" aria-expanded="false" data-mpmore="${esc(m)}">⋯</button>
        <div class="mp-menu" role="menu" hidden>
          ${linkTo("mp-menu-item", esc(t("mpMenuAdd")), "add")}
          ${site.url ? `<a class="mp-menu-item" role="menuitem" href="${esc(site.url)}" target="_blank" rel="noopener">${esc(t("mpMenuVisit", { site: site.domain }))}</a>` : ""}
        </div>
      </div>`;
  }).join("");
  return `<div class="mp-picker" id="mpPicker">
      <button type="button" class="mp-trigger" id="mpTrigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="mpPop" title="${esc(t("marketplace"))}">
        <span class="mp-logo-box sm">${mpLogoHTML(cur)}</span><span class="mp-trigger-name">${esc(curName)}</span>${mps.length > 1 ? `<span class="mp-plus" title="${esc(t("mpOthers", { n: mps.length - 1 }))}">+${mps.length - 1}</span>` : ""}<span class="mp-caret" aria-hidden="true">▾</span>
      </button>
      <div class="mp-pop" id="mpPop" role="listbox" aria-label="${esc(t("mpTitle"))}" hidden>
        <div class="mp-pop-title">${esc(t("mpTitle"))}</div>
        ${cards}
        <div class="mp-add">${linkTo("mp-add-link", `<span class="mp-add-plus" aria-hidden="true">+</span> ${esc(t("mpAdd"))}`, "add")}</div>
      </div>
    </div>`;
}

function closeMpPicker(focusTrigger) {
  const pop = document.getElementById("mpPop"), trg = document.getElementById("mpTrigger");
  if (!pop || pop.hidden) return;
  pop.hidden = true; trg.setAttribute("aria-expanded", "false");
  pop.querySelectorAll(".mp-menu").forEach((m) => { m.hidden = true; });
  pop.querySelectorAll(".mp-more").forEach((b) => b.setAttribute("aria-expanded", "false"));
  if (focusTrigger) trg.focus();
}

function openMpPicker() {
  const pop = document.getElementById("mpPop"), trg = document.getElementById("mpTrigger");
  if (!pop) return;
  pop.hidden = false; trg.setAttribute("aria-expanded", "true");
  const sel = pop.querySelector(".mp-card.sel") || pop.querySelector(".mp-card");
  if (sel) sel.focus({ preventScroll: true });
}

function bindMpPicker() {
  const trg = document.getElementById("mpTrigger"), pop = document.getElementById("mpPop");
  if (!trg || !pop) return;
  const choose = (m) => { if (m && m !== state.marketplace) { state.marketplace = m; state.itemKey = null; renderPage(); } else closeMpPicker(true); };
  trg.addEventListener("click", () => (pop.hidden ? openMpPicker() : closeMpPicker()));
  trg.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && pop.hidden) { e.preventDefault(); openMpPicker(); } });
  pop.addEventListener("click", (e) => {
    const more = e.target.closest(".mp-more");
    if (more) {                                           // the three-dot menu of one card: never selects the card
      e.stopPropagation();
      const menu = more.parentElement.querySelector(".mp-menu"), open = menu.hidden;
      pop.querySelectorAll(".mp-menu").forEach((x) => { x.hidden = true; });
      pop.querySelectorAll(".mp-more").forEach((b) => b.setAttribute("aria-expanded", "false"));
      menu.hidden = !open; more.setAttribute("aria-expanded", String(open));
      return;
    }
    const link = e.target.closest("a, button[data-act='help']");
    if (link) {
      if (link.dataset.act === "help") { state.helpOpen = true; renderPage(); window.scrollTo(0, 0); }
      else closeMpPicker();                               // real links (sheet, marketplace site) open in a new tab
      return;
    }
    const card = e.target.closest(".mp-card");
    if (card) choose(card.dataset.mp);
  });
  pop.addEventListener("keydown", (e) => {
    const cards = [...pop.querySelectorAll(".mp-card")], i = cards.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeMpPicker(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); (cards[i + 1] || cards[0]).focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (cards[i - 1] || cards[cards.length - 1]).focus(); }
    else if ((e.key === "Enter" || e.key === " ") && i >= 0 && document.activeElement.classList.contains("mp-card")) { e.preventDefault(); choose(document.activeElement.dataset.mp); }
    else if (e.key === "Tab") closeMpPicker();
  });
  if (!MP_BOUND) {   // one listener for the whole page: a click anywhere outside the dropdown closes it
    MP_BOUND = true;
    document.addEventListener("click", (e) => { if (!(e.target.closest && e.target.closest("#mpPicker"))) closeMpPicker(); });
  }
}

function addButtonHTML(id, label, cls) {
  return SETTINGS.sheet_url
    ? `<a class="btn ${cls}" id="${id}" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener" title="${esc(t("opensSheet"))}">${label}</a>`
    : `<button class="btn ${cls}" id="${id}">${label}</button>`;
}

function helpPanelHTML() {
  const link = SETTINGS.sheet_url ? `<p>${t("helpLinked", { url: esc(SETTINGS.sheet_url) })}</p>` : `<p>${t("helpNoSheet")}</p>`;
  return `
    <div class="help-panel">
      <b>${t("helpTitle")}</b>
      <p>${t("helpTabs")}</p>
      <p>${t("helpEvery")}</p>
      ${link}
      <p>${t("helpNew")}</p>
    </div>`;
}

let VIEW = { rows: [], rangeText: "" };

function computeView() {
  const rows = inPeriod(currentItem().rows);
  const dates = rows.map((r) => r.date).sort();
  let rangeText = "";
  if (dates.length) {
    const latest = dates[dates.length - 1];
    const start = state.days === "all" ? dates[0] : shiftDate(latest, -(state.days - 1));
    rangeText = `${state.days === "all" ? t("rangeAll") : t("rangeL", { n: state.days })}  ${fmtFull(start)} – ${fmtFull(latest)}`;
  }
  VIEW = { rows, rangeText };
}

// ---------- Searchable product box ----------
// Lower-case, accent-free text, so "anhanger" finds "Anhänger".
function foldText(t) { return String(t).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
function markMatches(text, terms) {
  let out = esc(text);
  terms.forEach((t) => { if (t) out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
  return out;
}
let COMBO_CLOSE = null; // closes the product list that is currently open (one document-level listener, bound once)
document.addEventListener("mousedown", (e) => { if (COMBO_CLOSE && !e.target.closest(".combo")) COMBO_CLOSE(); });

function bindCombo(entries, selectedKey) {
  const input = document.getElementById("itemInput"), list = document.getElementById("itemList"), toggle = document.getElementById("itemToggle");
  if (!input || !list) return;
  const current = entries.find((e) => e.key === selectedKey);
  let shown = entries, active = -1, open = false;

  const setOpen = (v) => { open = v; list.hidden = !v; input.setAttribute("aria-expanded", String(v)); if (!v) input.removeAttribute("aria-activedescendant"); };
  const close = () => { if (open) setOpen(false); input.value = current ? current.text : ""; };
  const paintActive = () => {
    [...list.children].forEach((li, i) => li.classList.toggle("active", i === active));
    const li = list.children[active];
    if (li && li.id) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
  };
  const render = (query) => {
    const terms = foldText(query).split(/\s+/).filter(Boolean);
    shown = terms.length ? entries.filter((e) => terms.every((t) => e.hay.includes(t))) : entries;
    list.innerHTML = shown.length
      ? shown.map((e, i) => `<li role="option" id="itemOpt${i}" data-key="${esc(e.key)}" class="${e.key === selectedKey ? "sel" : ""}"${e.title ? ` title="${esc(e.title)}"` : ""}>${markMatches(e.text, terms)}</li>`).join("")
      : `<li class="none">${esc(t("noProductMatch", { q: query }))}</li>`;
    // empty box: start on the current product; while typing: start on the first match
    active = shown.length ? (terms.length ? 0 : Math.max(0, shown.findIndex((e) => e.key === selectedKey))) : -1;
    paintActive();
  };
  const choose = (key) => {
    setOpen(false);
    if (key && key !== state.itemKey) { state.itemKey = key; renderPage(); } else input.value = current ? current.text : "";
  };
  const show = (query) => { render(query); setOpen(true); COMBO_CLOSE = close; };

  input.addEventListener("focus", () => { input.select(); show(""); });
  input.addEventListener("click", () => { if (!open) { input.select(); show(""); } });
  input.addEventListener("input", () => show(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { show(""); return; }
      if (shown.length) { active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; paintActive(); }
    } else if (e.key === "Enter") {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active].key); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); close(); input.select(); }
    } else if (e.key === "Tab") { close(); }
  });
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();                                   // keep the box focused until the choice is made
    const li = e.target.closest("li[data-key]");
    if (li) choose(li.dataset.key);
  });
  list.addEventListener("mousemove", (e) => {
    const li = e.target.closest("li[data-key]");
    if (li) { active = [...list.children].indexOf(li); [...list.children].forEach((x, i) => x.classList.toggle("active", i === active)); }
  });
  toggle.addEventListener("mousedown", (e) => { e.preventDefault(); if (open) close(); else { input.focus(); show(""); } });
}

function renderPage() {
  if (state.view === "competitors" && !COMP.available) state.view = "ranks";
  const app = document.getElementById("app");
  const projects = Object.values(PROJECTS);

  const demoBanner = IS_DEMO
    ? `<div class="demo-banner">${esc(t("demoBanner"))}</div>`
    : "";

  const sheetProjects = CONFIG ? (CONFIG.projects || []).length : 0;
  if (!projects.length && !sheetProjects) {
    app.innerHTML = `
      ${demoBanner}
      <div class="topbar"><img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" /><h1>Rank Tracker</h1><div class="spacer"></div>${langToggleHTML()}</div>
      ${helpPanelHTML()}
      <div class="content"><div class="empty-state">${esc(t("nothingTracked"))}</div></div>`;
    bindLangToggle();
    return;
  }
  if (state.page === "projects" || !projects.length) { renderProjectsPage(demoBanner); return; }

  if (!PROJECTS[state.projectId]) state.projectId = projects[0].project_id;
  const project = currentProject();
  const mps = marketplacesOf(project);
  if (!state.marketplace || !mps.includes(state.marketplace)) state.marketplace = mps[0];
  const items = sortedItems(project, state.marketplace);
  if (!state.itemKey || !project.items[state.itemKey] || project.items[state.itemKey].marketplace !== state.marketplace) {
    state.itemKey = items[0].item_key;   // the list starts with "★ All <marketplace> products — best position" whenever the marketplace has 2+ products
  }
  const multiCountry = new Set(items.filter((i) => !i.synthetic).map((i) => i.country)).size > 1;
  computeView();

  const lastChecked = project.rows.map((r) => r.checked_at || r.date).sort().pop();
  const opt = (v, text, sel, title) => `<option value="${esc(v)}" ${sel ? "selected" : ""}${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</option>`;
  const projectOptions = projects.map((p) => opt(p.project_id, p.project_name, p.project_id === state.projectId)).join("");
  const comboEntries = items.map((i) => ({
    key: i.item_key, text: itemText(i, multiCountry), title: i.synthetic ? "" : i.label || "",
    // what typing can match: SKU, product ID, country and the product name (the name is searched but not shown)
    hay: foldText([i.sku, i.product_id, i.country, i.synthetic ? `${i.label} all best position alle beste` : i.label].filter(Boolean).join(" ")),
  }));
  const selectedText = (comboEntries.find((e) => e.key === state.itemKey) || { text: "" }).text;
  const periods = [[14, t("lastDays", { n: 14 })], [30, t("lastDays", { n: 30 })], [60, t("lastDays", { n: 60 })], [90, t("lastDays", { n: 90 })], ["all", t("allTime")]]
    .map(([v, label]) => opt(v, label, String(v) === String(state.days))).join("");
  const hasOrganic = project.rows.some((r) => r.organic_rank !== undefined);
  const basisSelect = hasOrganic
    ? `<select id="basisSelect" title="${esc(t("countTitle"))}"><option value="all" ${state.basis === "all" ? "selected" : ""}>${esc(t("countAll"))}</option><option value="organic" ${state.basis === "organic" ? "selected" : ""}>${esc(t("countOrganic"))}</option></select>`
    : "";
  const rangeGroup = `${basisSelect}<div class="range-group">${["daily", "weekly", "monthly"].map((r) => `<div class="range-btn ${state.range === r ? "active" : ""}" data-range="${r}">${esc(t(r))}</div>`).join("")}</div>
      <select id="periodSelect">${periods}</select><span class="range-text">${esc(VIEW.rangeText)}</span>`;

  const controls = `<div class="ctrl-group">${mpPickerHTML(project, mps)}<div class="combo" id="itemCombo">
        <input type="text" class="combo-input" id="itemInput" role="combobox" aria-expanded="false" aria-controls="itemList" aria-autocomplete="list"
               autocomplete="off" spellcheck="false" placeholder="${esc(t("searchPh"))}" value="${esc(selectedText)}" title="${esc(t("searchTitle"))}" />
        <button type="button" class="combo-toggle" id="itemToggle" tabindex="-1" aria-label="${esc(t("showAllProducts"))}">▾</button>
        <ul class="combo-list" id="itemList" role="listbox" hidden></ul>
      </div>${addButtonHTML("addKwBtn", t("addKeyword"), "")}</div><div class="ctrl-group">${rangeGroup}</div>`;

  app.innerHTML = `
    ${demoBanner}
    <div class="topbar">
      <a class="topbar-back" href="#/projects" title="${esc(t("pjBack"))}" aria-label="${esc(t("pjBack"))}">← ${esc(t("pjBack"))}</a>
      <img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" />
      <h1>Rank Tracker</h1>
      <select class="project-select" id="projectSelect">${projectOptions}</select>
      <div class="spacer"></div>
      ${langToggleHTML()}
      <span class="updated">${esc(t("lastChecked"))} ${esc(new Date(lastChecked).toLocaleString(LOCALE()))}</span>
      ${addButtonHTML("helpBtn", t("addProducts"), "primary")}
    </div>
    ${state.helpOpen ? helpPanelHTML() : ""}
    <div class="content">
      ${COMP.available ? `<div class="view-tabs" role="tablist"><button type="button" class="view-tab ${state.view === "ranks" ? "active" : ""}" data-view="ranks" role="tab">${esc(t("tabRanks"))}</button><button type="button" class="view-tab ${state.view === "competitors" ? "active" : ""}" data-view="competitors" role="tab">${esc(t("tabCompetitors"))}</button></div>` : ""}
      ${state.view === "competitors" ? `<div id="compRoot"></div>` : `<div class="controls-row">${controls}</div>
      <div class="summary-grid" id="summaryGrid"></div>
      <div class="table-toolbar" id="tableToolbar"></div>
      <div class="grid-legend" id="gridLegend"></div>
      <div class="grid-wrap"><table class="rankgrid" id="rankGrid"></table></div>`}
      <div class="version-note">${esc(t("versionNote"))} ${APP_VERSION}</div>
    </div>`;

  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  bindLangToggle();
  document.querySelectorAll(".view-tab").forEach((b) => b.addEventListener("click", () => { if (state.view !== b.dataset.view) { state.view = b.dataset.view; renderPage(); } }));
  on("projectSelect", "change", (e) => {
    state.projectId = e.target.value; state.marketplace = null; state.itemKey = null; markOpened(state.projectId);
    try { history.replaceState(null, "", "#/project/" + encodeURIComponent(state.projectId)); } catch (err) { /* address bar not available: the page still switches */ }
    renderPage();
  });
  bindMpPicker();
  bindCombo(comboEntries, state.itemKey);
  on("basisSelect", "change", (e) => { state.basis = e.target.value; applyBasis(ALL_ROWS); renderPage(); });
  on("periodSelect", "change", (e) => { state.days = e.target.value === "all" ? "all" : Number(e.target.value); renderPage(); });
  if (!SETTINGS.sheet_url) {   // with a sheet link set, these are plain links that open the sheet; without one they show the how-to panel
    on("helpBtn", "click", () => { state.helpOpen = !state.helpOpen; renderPage(); });
    on("addKwBtn", "click", () => { state.helpOpen = true; renderPage(); window.scrollTo(0, 0); });
  }
  document.querySelectorAll(".range-btn").forEach((b) => b.addEventListener("click", () => { state.range = b.dataset.range; renderPage(); }));

  if (state.view === "competitors") { safely("compRoot", renderCompetitors); loadCompetitors(); return; }
  safely("summaryGrid", () => renderSummaryCards(VIEW.rows));
  safely("rankGrid", renderTable);
}

// ---------- Summary cards (charts are drawn here as SVG: no outside libraries) ----------
function computeSeries(rows) {
  // A blocked check means "we couldn't look", not "you weren't found", so it stays out.
  const valid = rows.filter((r) => !r.blocked);
  const dates = uniq(valid.map((r) => r.date)).sort();
  const by = {};
  valid.forEach((r) => (by[r.date] = by[r.date] || []).push(r));
  const out = { dates, vis: [], avg: [], top10: [], dist: [] };
  dates.forEach((d) => {
    const rs = by[d];
    out.vis.push((rs.filter((r) => r.rank !== null).length / rs.length) * 100);
    out.avg.push(mean(rs.map((r) => r.rank)));
    out.top10.push(rs.filter((r) => r.rank !== null && r.rank <= 10).length);
    const c = [0, 0, 0, 0, 0];
    rs.forEach((r) => c[bucketOf(r.rank)]++);
    out.dist.push(c);
  });
  return out;
}

const CW = 320, CH = 126, CL = 6, CT = 10, CB = 24;
function fmtTick(v) { return Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v)) : nf(v, 1); }

function lineSVG(dates, values, o = {}) {
  const R = 44, pw = CW - CL - R, ph = CH - CT - CB;
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return `<svg viewBox="0 0 ${CW} ${CH}" class="chart"><text x="${CW / 2}" y="${CH / 2}" text-anchor="middle" class="ax">${esc(t("noData"))}</text></svg>`;
  let lo = o.min ?? Math.min(...nums), hi = o.max ?? Math.max(...nums);
  if (o.min === undefined || o.max === undefined) { const pad = (hi - lo) * 0.12 || 1; if (o.min === undefined) lo = Math.max(0, lo - pad); if (o.max === undefined) hi += pad; }
  if (hi === lo) hi = lo + 1;
  const n = values.length;
  const x = (i) => (n === 1 ? CL + pw / 2 : CL + (i * pw) / (n - 1));
  const y = (v) => { const f = (v - lo) / (hi - lo); return o.reverse ? CT + f * ph : CT + (1 - f) * ph; };
  const base = CT + ph;

  const segs = []; let cur = [];
  values.forEach((v, i) => { if (v === null || v === undefined) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
  if (cur.length) segs.push(cur);
  const pt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let line = "", area = "";
  segs.forEach((s) => {
    if (s.length > 1) {
      line += `M${s.map(pt).join(" L")} `;
      area += `M${s[0][0].toFixed(1)} ${base} L${s.map(pt).join(" L")} L${s[s.length - 1][0].toFixed(1)} ${base} Z `;
    }
  });
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => `<line x1="${CL}" x2="${CW - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/><text x="${CW - R + 5}" y="${(y(t) + 3).toFixed(1)}" class="ax">${(o.fmt || fmtTick)(t)}</text>`).join("");
  const color = o.color || "#D97757";
  const lastIdx = (() => { for (let i = n - 1; i >= 0; i--) if (values[i] !== null && values[i] !== undefined) return i; return -1; })();
  const hover = values.map((v, i) => (v === null || v === undefined ? "" : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="5" class="hit"><title>${esc(fmtDateShort(dates[i]))}: ${(o.fmt || fmtTick)(v)}</title></circle>`)).join("");
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img">${ticks}
    <path d="${area}" fill="${color}" opacity="0.10"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${lastIdx >= 0 ? `<circle cx="${x(lastIdx).toFixed(1)}" cy="${y(values[lastIdx]).toFixed(1)}" r="3" fill="${color}"/>` : ""}
    <text x="${CL}" y="${CH - 4}" class="ax">${esc(fmtDateShort(dates[0]))}</text><text x="${CW - R}" y="${CH - 4}" text-anchor="end" class="ax">${esc(fmtDateShort(dates[n - 1]))}</text>${hover}</svg>`;
}

function distSVG(dates, dist) {
  const L = CL, R = 6, pw = CW - L - R, ph = CH - CT - CB, n = dates.length;
  const maxTotal = Math.max(1, ...dist.map((c) => c.reduce((a, b) => a + b, 0)));
  const slot = pw / n, bw = Math.max(1.5, Math.min(14, slot * 0.72));
  let bars = "";
  dist.forEach((c, i) => {
    const cx = L + slot * i + slot / 2;
    let yTop = CT + ph;
    c.forEach((count, b) => {
      if (!count) return;
      const h = (count / maxTotal) * ph;
      yTop -= h;
      bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${DIST_COLORS[b]}"><title>${esc(fmtDateShort(dates[i]))} · ${distLabel(b)}: ${count}</title></rect>`;
    });
  });
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img">${bars}<text x="${L}" y="${CH - 4}" class="ax">${esc(fmtDateShort(dates[0]))}</text><text x="${CW - R}" y="${CH - 4}" text-anchor="end" class="ax">${esc(fmtDateShort(dates[n - 1]))}</text></svg>`;
}

function renderSummaryCards(rows) {
  const wrap = document.getElementById("summaryGrid");
  const S = computeSeries(rows);
  if (!S.dates.length) { wrap.innerHTML = `<div class="card wide"><div class="label">${esc(t("noUsable"))}</div></div>`; return; }
  const n = S.dates.length, last = n - 1;
  const counts = S.dist[last], total = counts.reduce((a, b) => a + b, 0);
  const delta = (cur, prev, goodWhenUp, unit, dec = 0) => {
    if (n < 2 || prev === null || prev === undefined || cur === null || cur === undefined) return `<span class="delta flat">${esc(t("firstChecks"))}</span>`;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span class="delta flat">${esc(t("noChange"))}</span>`;
    const good = goodWhenUp ? d > 0 : d < 0;
    return `<span class="delta ${good ? "good" : "bad"}"><i>${d > 0 ? "▲" : "▼"}</i> ${nf(Math.abs(d), dec)}${unit} ${esc(t("vsPrev"))}</span>`;
  };
  wrap.innerHTML = `
    <div class="card" title="${esc(t("visTitle"))}">
      <div class="label">${esc(t("visibility"))}</div>
      <div class="value">${pct(S.vis[last], 1)}</div>
      ${delta(S.vis[last], S.vis[last - 1], true, t("pts"), 1)}
      ${lineSVG(S.dates, S.vis, { min: 0, max: 100, fmt: (v) => Math.round(v) })}
    </div>
    <div class="card" title="${esc(t("avgTitle"))}">
      <div class="label">${esc(t("avgPos"))}</div>
      <div class="value">${S.avg[last] !== null ? nf(S.avg[last], 1) : "–"}</div>
      ${delta(S.avg[last], S.avg[last - 1], false, "", 1)}
      ${lineSVG(S.dates, S.avg, { reverse: true })}
    </div>
    <div class="card" title="${esc(t("top10Title"))}">
      <div class="label">${esc(t("top10Label"))}</div>
      <div class="value">${S.top10[last]} <span class="of">${esc(t("of"))} ${total}</span></div>
      ${delta(S.top10[last], S.top10[last - 1], true, "")}
      ${lineSVG(S.dates, S.top10, { min: 0, max: Math.max(2, Math.ceil(Math.max(...S.top10) / 2) * 2), fmt: (v) => Math.round(v) })}
    </div>
    <div class="card">
      <div class="label">${esc(t("distribution"))}</div>
      <div class="dist-wrap">
        <div class="dist-chart">${distSVG(S.dates, S.dist)}</div>
        <div class="dist-legend">${DIST_LABELS.map((_, i) => `<div><span class="dot" style="background:${DIST_COLORS[i]}"></span>${esc(distLabel(i))}<b>${counts[i]}</b></div>`).reverse().join("")}</div>
      </div>
    </div>`;
}

// ---------- Pop-up note on the "best position" table ----------
let POP = {};
function popHTML(p) {
  const basis = state.basis === "organic" ? t("organicPosition") : t("position");
  const more = p.tied.length ? `<div class="pop-more">${esc(t("tiedWith"))} ${esc(p.tied.join(", "))}</div>` : "";
  const others = p.others.length
    ? `<div class="pop-more">${esc(t("alsoRanking", { n: p.others.length }))}: ${p.others.slice(0, 4).map((o) => `${esc(o.who)} <i>#${o.rank}</i>`).join(", ")}${p.others.length > 4 ? ` ${esc(t("plusMore", { n: p.others.length - 4 }))}` : ""}</div>`
    : (p.tied.length ? "" : `<div class="pop-more">${esc(t("noOther"))}</div>`);
  const main = p.sku ? `<b class="pop-sku">${esc(p.sku)}</b> · <span class="pop-id">${esc(p.holder.split(" · ").slice(1).join(" · "))}</span>` : `<b class="pop-sku">${esc(p.holder)}</b>`;
  return `<div class="pop-head"><span class="pop-title">${esc(t("rankedFirst"))} · ${esc(fmtDateShort(p.date))}</span><button type="button" class="pop-x" data-close aria-label="${esc(t("close"))}">×</button></div>
    <div class="pop-main">${main}</div>
    <div class="pop-sub">${esc(t("posFor", { basis, rank: p.rank, kw: p.kw }))}</div>
    <div class="pop-actions">${p.sku ? `<button type="button" data-copy="sku">${esc(t("copySku"))}</button>` : ""}<button type="button" data-copy="id">${esc(t("copyId"))}</button><button type="button" data-copy="all">${esc(t("copyAll"))}</button></div>
    ${more}${others}<div class="pop-hint">${esc(t("pinned"))}</div>`;
}
function popCopyText(p, what) {
  if (what === "sku") return p.sku;
  if (what === "id") return p.id || p.holder;
  const lines = [t("copyRankedFirst", { kw: p.kw, date: fmtDateShort(p.date) }), `${p.holder} — ${state.basis === "organic" ? t("organicPosition") : t("position")} ${p.rank}`];
  p.tied.forEach((x) => lines.push(`${x} — ${t("tied")}`));
  if (p.others.length) { lines.push(t("alsoRankingColon")); p.others.forEach((o) => lines.push(`${o.who} — ${o.rank}`)); }
  return lines.join("\n");
}
async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0"; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  ta.remove(); return ok;
}
(function initRankPop() {
  const el = document.createElement("div");
  el.id = "rankPop"; el.className = "rank-pop"; el.hidden = true; el.setAttribute("role", "dialog");
  document.body.appendChild(el);
  let current = null, pinned = false, timer = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const hide = () => { cancel(); el.hidden = true; el.classList.remove("pinned"); current = null; pinned = false; };
  const later = () => { cancel(); if (!pinned) timer = setTimeout(hide, 350); };   // a short grace period lets the mouse travel onto the pop-up
  const place = () => {
    if (!current) return;
    if (!current.isConnected) return hide();
    const r = current.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    el.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + "px";
    el.style.top = (r.bottom + h + 8 > vh && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 2) + "px";
  };
  const show = (td, pin) => {
    const p = POP[td.dataset.pop];
    if (!p) return hide();
    cancel(); current = td; pinned = !!pin; el.classList.toggle("pinned", pinned);
    el.setAttribute("aria-label", t("popLabel")); el.innerHTML = popHTML(p); el.hidden = false; place();
  };
  const cellOf = (e) => (e.target.closest ? e.target.closest("td[data-pop]") : null);
  const inPop = (e) => !!(e.target.closest && e.target.closest("#rankPop"));
  document.addEventListener("mouseover", (e) => {
    if (inPop(e)) return cancel();                       // on the pop-up: keep it
    const td = cellOf(e);
    if (pinned) return;                                  // a pinned pop-up stays until it is closed
    if (td) { if (td !== current) show(td, false); else cancel(); } else later();
  });
  document.addEventListener("focusin", (e) => {
    if (inPop(e)) return cancel();
    const td = cellOf(e);
    if (pinned) return;
    if (td) show(td, false); else hide();
  });
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest ? e.target.closest("#rankPop button") : null;
    if (btn) {
      if (btn.hasAttribute("data-close")) return hide();
      const what = btn.dataset.copy, p = current && POP[current.dataset.pop];
      if (what && p) {
        const ok = await copyText(popCopyText(p, what));
        const old = btn.dataset.label || btn.textContent; btn.dataset.label = old;
        btn.textContent = ok ? t("copied") : t("pressCopy"); btn.classList.toggle("done", ok);
        setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1600);
      }
      return;
    }
    if (inPop(e)) return;
    const td = cellOf(e);
    if (td) show(td, true);                               // click or tap pins it so the text can be selected and copied
    else hide();
  });
  el.addEventListener("mouseenter", cancel);
  el.addEventListener("mouseleave", later);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (pinned) place(); else if (!el.hidden) hide(); }, true);   // a pinned pop-up follows its cell
  window.addEventListener("resize", () => { if (pinned) place(); else hide(); });
  document.addEventListener("rankpop-reset", hide);
})();

// ---------- Keyword pop-up: rank history chart + "Open on <marketplace>" ----------
const EBAY_SITES = { DE: "ebay.de", AT: "ebay.at", US: "ebay.com", GB: "ebay.co.uk", FR: "ebay.fr", IT: "ebay.it", ES: "ebay.es", NL: "ebay.nl", PL: "ebay.pl" };
const MODAL = { keyword: null, itemKey: null, days: 30, show: { organic: true, ads: true, overall: false }, opener: null };

// The page a shopper sees for this keyword: for eBay Germany the same address the tracker reads (same page size,
// delivery postcode and country), so the positions can be compared with what the chart says.
function marketplaceUrl(item, keyword) {
  const plus = encodeURIComponent(keyword).replace(/%20/g, "+");
  if (item.marketplace === "ebay") {
    const pc = CONFIG && CONFIG.ebay_postcode !== undefined ? CONFIG.ebay_postcode : "36179";
    return `https://www.${EBAY_SITES[item.country] || "ebay.de"}/sch/i.html?_nkw=${plus}&_sacat=0&_ipg=60&_pgn=1` + (item.country === "DE" && pc ? `&_stpos=${encodeURIComponent(pc)}&_fcid=77` : "");
  }
  if (item.marketplace === "otto") return `https://www.otto.de/suche/${encodeURIComponent(keyword)}/`;
  if (item.marketplace === "kaufland") return `https://www.kaufland.de/s/?search_value=${encodeURIComponent(keyword)}`;
  if (item.marketplace === "temu") return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keyword)}`;
  return null;
}

// One entry per day for this keyword: overall position, organic position, ad position, and which connection produced it.
// For the "★ All <marketplace> products" entry each day takes the best value across that marketplace's products.
function keywordSeries(project, itemKey, keyword) {
  const item = project.items[itemKey];
  const real = item.synthetic ? Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === item.marketplace) : [item];
  const nameOf = (it) => `${it.sku ? it.sku + " · " : ""}${it.product_id}`;
  const by = {};
  let hasOrganic = false;
  real.forEach((it) => it.rows.forEach((r) => {
    if (r.keyword !== keyword) return;
    if (r.organic_rank !== undefined) hasOrganic = true;
    const d = (by[r.date] = by[r.date] || { date: r.date, overall: null, organic: null, ad: null, found: false, blocked: true, scanned: r.results_scanned, holder: null, geo: r.page_geo, lang: r.page_lang, shipto: r.page_shipto });
    if (r.blocked) return;
    d.blocked = false;
    const overall = r.rank_all !== undefined ? r.rank_all : r.rank;
    if (overall !== null && overall !== undefined) { d.found = true; if (d.overall === null || overall < d.overall) d.overall = overall; }
    if (r.organic_rank !== null && r.organic_rank !== undefined && (d.organic === null || r.organic_rank < d.organic)) { d.organic = r.organic_rank; d.holder = nameOf(it); }
    if (r.promoted && r.ad_rank !== null && r.ad_rank !== undefined && (d.ad === null || r.ad_rank < d.ad)) d.ad = r.ad_rank;
  }));
  return { item, hasOrganic, dates: Object.keys(by).sort().map((k) => by[k]) };
}

const dayNo = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;

function chartData(series) {
  let dates = series.dates;
  if (MODAL.days !== "all" && dates.length) {
    const start = shiftDate(dates[dates.length - 1].date, -(MODAL.days - 1));
    dates = dates.filter((d) => d.date >= start);
  }
  return dates;
}

function chartSVG(dates, show) {
  const W = 920, H = 330, L = 46, R = 18, T = 18, B = 40, pw = W - L - R, ph = H - T - B;
  if (!dates.length) return "";
  const t0 = dayNo(dates[0].date), t1 = dayNo(dates[dates.length - 1].date), span = Math.max(1, t1 - t0);
  const X = (iso) => (dates.length === 1 ? L + pw / 2 : L + ((dayNo(iso) - t0) / span) * pw);
  const vals = [];
  dates.forEach((d) => { ["organic", "ad", "overall"].forEach((k) => { if (show[k] && d[k] !== null) vals.push(d[k]); }); });
  const maxY = Math.max(10, Math.ceil((vals.length ? Math.max(...vals) : 10) * 1.1));
  const Y = (v) => T + ((v - 1) / (maxY - 1)) * ph;
  const rawStep = (maxY - 1) / 5, step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((x) => x >= rawStep) || 500;
  const ticks = [1];
  for (let v = step; v < maxY; v += step) if (v > 1) ticks.push(v);
  let g = ticks.map((v) => `<line class="md-grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="md-ylab" x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`).join("");
  const n = Math.min(dates.length, 8);
  for (let k = 0; k < n; k++) {
    const iso = n === 1 ? dates[0].date : shiftDate(dates[0].date, Math.round((k * span) / (n - 1)));
    g += `<text class="md-xlab" x="${X(iso).toFixed(1)}" y="${H - 14}" text-anchor="middle">${esc(fmtDateShort(iso))}</text>`;
  }
  const series = [["organic", "md-organic"], ["ad", "md-ad"], ["overall", "md-overall"]];
  series.forEach(([key, cls]) => {
    if (!show[key]) return;
    let path = "", pts = "", prev = null;
    dates.forEach((d) => {
      if (d[key] === null) return;
      const x = X(d.date).toFixed(1), y = Y(d[key]).toFixed(1), tt = dayNo(d.date);
      path += `${prev !== null && tt - prev <= 2 ? " L" : " M"}${x} ${y}`; prev = tt;
      pts += `<circle class="${cls}-dot" cx="${x}" cy="${y}" r="3.4"/>`;
    });
    g += `<path class="md-line ${cls}" d="${path.trim()}"/>${pts}`;
  });
  dates.forEach((d) => {                      // checked, but your product was not in the results that were read
    if (!d.found && !d.blocked) g += `<circle class="md-nf" cx="${X(d.date).toFixed(1)}" cy="${Y(maxY).toFixed(1)}" r="3.6"><title>${esc(d.date)}: ${esc(t("notFound"))}${d.scanned ? " " + esc(t("inTheTop", { n: d.scanned })) : ""}</title></circle>`;
  });
  const hw = Math.max(10, pw / Math.max(1, dates.length));
  g += dates.map((d, i) => `<rect class="md-hit" data-i="${i}" x="${(X(d.date) - hw / 2).toFixed(1)}" y="${T}" width="${hw.toFixed(1)}" height="${ph}"/>`).join("");
  g += `<line class="md-guide" id="mdGuide" y1="${T}" y2="${T + ph}" x1="0" x2="0" hidden/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="md-svg" role="img" aria-label="${esc(t("rankHistory"))}">${g}</svg>`;
}

function tipHTML(d, hasOrganic) {
  const rows = [];
  if (hasOrganic) {
    rows.push(`<div><i class="sw md-organic-sw"></i>${esc(t("tipOrganic"))}: <b>${d.organic !== null ? d.organic : d.found ? esc(t("tipShownAsAd")) : esc(t("notFound"))}</b></div>`);
    if (d.ad !== null) rows.push(`<div><i class="sw md-ad-sw"></i>${esc(t("tipAdSlot"))}: <b>${d.ad}</b></div>`);
  }
  rows.push(`<div><i class="sw md-overall-sw"></i>${esc(t("tipOverall"))}: <b>${d.overall !== null ? d.overall : esc(t("notFound")) + (d.scanned ? " " + esc(t("inTheTop", { n: d.scanned })) : "")}</b></div>`);
  if (hasOrganic && d.organic !== null && d.overall !== null) rows.push(`<div class="md-tip-sub">${esc(t("tipAdsAbove", { n: d.overall - d.organic }))}</div>`);
  if (d.holder) rows.push(`<div class="md-tip-sub">${esc(t("tipBestProduct"))}: ${esc(d.holder)}</div>`);
  const bits = [];
  if (d.geo) bits.push(esc(d.geo === "DE" ? t("geoDE") : t("geoOther")));
  if (d.lang) bits.push(d.lang === "de" ? esc(t("langDE")) : esc(t("pageLang", { l: d.lang })));
  if (d.shipto) bits.push(esc(t("shipTo", { pc: d.shipto })));
  if (bits.length) rows.push(`<div class="md-tip-sub">${bits.join(" · ")}</div>`);
  return `<div class="md-tip-date">${esc(fmtDateShort(d.date))}, ${esc(d.date.slice(0, 4))}</div>${rows.join("")}`;
}

function renderKeywordModal() {
  const root = document.getElementById("kwModal");
  const project = currentProject();
  if (!root || !MODAL.keyword || !project || !project.items[MODAL.itemKey]) return;
  const series = keywordSeries(project, MODAL.itemKey, MODAL.keyword);
  const item = series.item;
  const show = series.hasOrganic ? MODAL.show : { organic: false, ad: false, overall: true };
  const showEff = { organic: show.organic, ad: show.ads !== undefined ? show.ads : show.ad, overall: show.overall };
  const dates = chartData(series);
  const last = dates[dates.length - 1];
  const now = last ? (last.organic !== null ? last.organic : last.overall) : null;
  const badge = now === 1 ? '<span class="kw-tag">#1</span>' : now !== null && now <= 3 ? '<span class="kw-tag">TOP 3</span>' : now !== null && now <= 10 ? '<span class="kw-tag">TOP 10</span>' : "";
  const linkItem = item.synthetic ? Object.values(project.items).find((i) => !i.synthetic && i.marketplace === item.marketplace) : item;
  const url = linkItem ? marketplaceUrl(linkItem, MODAL.keyword) : null;
  const mpName = MP_LABEL[item.marketplace] || item.marketplace;
  const items = sortedItems(project, item.marketplace);
  const multiCountry = new Set(items.filter((i) => !i.synthetic).map((i) => i.country)).size > 1;
  const options = items.map((i) => `<option value="${esc(i.item_key)}" ${i.item_key === MODAL.itemKey ? "selected" : ""}>${esc(itemText(i, multiCountry))}</option>`).join("");
  const found = dates.filter((d) => d.found).length, checked = dates.filter((d) => !d.blocked).length;
  const orgs = dates.filter((d) => d.organic !== null);
  const bestOrg = orgs.length ? orgs.reduce((a, b) => (b.organic <= a.organic ? b : a)) : null;
  const ranges = [[t("r7"), 7], [t("r30"), 30], [t("r90"), 90], [t("r365"), 365], [t("rAll"), "all"]];
  const chips = series.hasOrganic
    ? `<label class="md-chip md-organic-chip"><input type="checkbox" id="mdOrg" ${MODAL.show.organic ? "checked" : ""}> ${esc(t("organic"))}</label>
       <label class="md-chip md-ad-chip"><input type="checkbox" id="mdAd" ${MODAL.show.ads ? "checked" : ""}> ${esc(t("sponsored"))}</label>
       <label class="md-chip md-overall-chip"><input type="checkbox" id="mdAll" ${MODAL.show.overall ? "checked" : ""}> ${esc(t("overallChip"))}</label>`
    : `<span class="md-note">${esc(t("onePos"))}</span>`;
  const stat = (label, v) => `<div class="md-stat"><span>${label}</span><b>${v}</b></div>`;
  const pc = CONFIG && CONFIG.ebay_postcode !== undefined ? CONFIG.ebay_postcode : "36179";
  const hint = item.marketplace === "ebay"
    ? t("hintEbay", { mp: esc(mpName), de: item.country === "DE" || (linkItem && linkItem.country === "DE") ? t("hintDe", { pc: esc(pc) }) : "" })
    : t("hintOther", { mp: esc(mpName) });
  root.innerHTML = `
    <div class="kw-backdrop" data-close></div>
    <div class="kw-dialog" role="dialog" aria-modal="true" aria-labelledby="mdTitle">
      <div class="md-head">
        <div class="md-title"><h2 id="mdTitle">${esc(MODAL.keyword)}</h2>${badge}</div>
        <div class="md-actions">${item.marketplace === "ebay" && COMP.available ? `<button type="button" class="btn" id="mdComp">${esc(t("openCompetitors"))}</button>` : ""}${url ? `<a class="btn" id="mdOpen" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("openOn", { mp: mpName }))}</a>` : ""}<button type="button" class="md-x" id="mdClose" data-close aria-label="${esc(t("close"))}">×</button></div>
      </div>
      <div class="md-controls"><label class="md-label" for="mdProduct">${esc(t("product"))}</label><select id="mdProduct" class="md-select">${options}</select></div>
      <div class="md-toolbar"><div class="md-chips">${chips}</div>
        <div class="md-ranges">${ranges.map(([l, d]) => `<button type="button" class="md-range ${MODAL.days === d ? "active" : ""}" data-days="${d}">${l}</button>`).join("")}</div></div>
      ${dates.length ? `<div class="md-chart" id="mdChart">${chartSVG(dates, showEff)}<div class="md-tip" id="mdTip" hidden></div></div>
        <div class="md-stats">${stat(esc(series.hasOrganic ? t("latestOrganic") : t("latestPosition")), last ? (series.hasOrganic ? (last.organic !== null ? last.organic : last.found ? esc(t("adOnly")) : esc(t("notFound"))) : last.overall !== null ? last.overall : esc(t("notFound"))) : "–")}
          ${bestOrg ? stat(esc(t("bestOrganic")), `${bestOrg.organic} <small>${esc(fmtDateShort(bestOrg.date))}</small>`) : ""}${stat(esc(t("foundStat")), esc(t("xOfYDays", { found, checked })))}</div>`
        : `<div class="md-empty">${esc(t("noReadings"))}</div>`}
      <p class="md-hint">${hint}</p>
    </div>`;
  MODAL.dates = dates; MODAL.hasOrganic = series.hasOrganic;
  bindKeywordModal();
}

function bindKeywordModal() {
  const root = document.getElementById("kwModal");
  const redraw = () => { const focus = document.activeElement && document.activeElement.id; renderKeywordModal(); if (focus) { const el = document.getElementById(focus); if (el) el.focus(); } };
  root.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeKeywordModal));
  const goComp = document.getElementById("mdComp");
  if (goComp) goComp.addEventListener("click", () => {
    const project = currentProject(), it = project.items[MODAL.itemKey];
    const real = it.synthetic ? Object.values(project.items).find((i) => !i.synthetic && i.marketplace === it.marketplace) : it;
    state.compKw = `${(real && real.country) || "DE"}|${MODAL.keyword}`; state.view = "competitors";
    closeKeywordModal(); renderPage();
  });
  const sel = document.getElementById("mdProduct"); if (sel) sel.addEventListener("change", (e) => { MODAL.itemKey = e.target.value; redraw(); });
  [["mdOrg", "organic"], ["mdAd", "ads"], ["mdAll", "overall"]].forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.addEventListener("change", (e) => { MODAL.show[key] = e.target.checked; redraw(); }); });
  root.querySelectorAll(".md-range").forEach((b) => b.addEventListener("click", () => { MODAL.days = b.dataset.days === "all" ? "all" : +b.dataset.days; redraw(); }));
  const tip = document.getElementById("mdTip"), guide = document.getElementById("mdGuide");
  root.querySelectorAll(".md-hit").forEach((r) => {
    r.addEventListener("mouseover", () => {
      const d = MODAL.dates[+r.dataset.i]; if (!d || !tip) return;
      tip.innerHTML = tipHTML(d, MODAL.hasOrganic); tip.hidden = false;
      const x = +r.getAttribute("x") + +r.getAttribute("width") / 2;
      if (guide) { guide.setAttribute("x1", x); guide.setAttribute("x2", x); guide.hidden = false; }
      tip.style.left = Math.min(Math.max((x / 920) * 100, 14), 78) + "%";
    });
    r.addEventListener("mouseleave", () => { if (tip) tip.hidden = true; if (guide) guide.hidden = true; });
  });
}

function openKeywordModal(keyword, opener) {
  MODAL.keyword = keyword; MODAL.itemKey = state.itemKey; MODAL.opener = opener || null;
  MODAL.days = 30; MODAL.show = { organic: true, ads: true, overall: false };
  renderKeywordModal();
  document.getElementById("kwModal").hidden = false;
  document.body.classList.add("modal-open");
  const x = document.getElementById("mdClose"); if (x) x.focus();
}

function closeKeywordModal() {
  const root = document.getElementById("kwModal"); if (!root || root.hidden) return;
  root.hidden = true; root.innerHTML = ""; document.body.classList.remove("modal-open");
  if (MODAL.opener && MODAL.opener.isConnected) MODAL.opener.focus();
  MODAL.keyword = null;
}

(function initKeywordModal() {
  const root = document.createElement("div");
  root.id = "kwModal"; root.className = "kw-modal"; root.hidden = true;
  document.body.appendChild(root);
  document.addEventListener("click", (e) => { const k = e.target.closest && e.target.closest(".kw-name[data-kw]"); if (k) openKeywordModal(k.dataset.kw, k); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.hidden) closeKeywordModal();
    else if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("kw-name")) { e.preventDefault(); openKeywordModal(e.target.dataset.kw, e.target); }
  });
})();

// ---------- Competitors view ----------
// Data comes from docs/data/competitors/YYYY-MM.json (see scripts/competitors.py), loaded only when this view is opened.
const COMP = { status: "idle", shards: {}, items: {}, dates: [], rows: new Map(), available: false, index: null };

// Is there any competitor data at all? Until the tracker has saved some (it is off by default), the Competitors tab and the
// pop-up button stay hidden, so nothing about it shows. One tiny file is checked at start-up; the data itself loads only on demand.
async function probeCompetitors() {
  COMP.index = await fetchJSON("data/competitors/index.json");
  COMP.available = !!(COMP.index && Array.isArray(COMP.index.months) && COMP.index.months.length);
}

async function loadCompetitors() {
  if (COMP.status !== "idle") return;
  COMP.status = "loading";
  const idx = COMP.index || (await fetchJSON("data/competitors/index.json"));
  const months = idx && Array.isArray(idx.months) ? idx.months.slice(-2) : [];
  const shards = await Promise.all(months.map((m) => fetchJSON(`data/competitors/${m}.json`)));
  const dates = new Set();
  shards.forEach((sh) => {                                   // oldest month first, so newer details win
    if (!sh || !sh.days) return;
    COMP.shards[sh.month] = sh;
    Object.entries(sh.items || {}).forEach(([id, m]) => {
      COMP.items[id] = { title: m[0], seller: m[1] >= 0 ? (sh.sellers || [])[m[1]] || null : null, biz: m[2], fb: m[3], fbn: m[4], top: m[5] };
    });
    Object.keys(sh.days).forEach((d) => dates.add(d));
  });
  COMP.dates = [...dates].sort();
  COMP.status = COMP.dates.length ? "ready" : "empty";
  if (state.view === "competitors") { safely("compRoot", renderCompetitors); }
}

function compRows(date, key) {
  const ck = date + "|" + key;
  if (COMP.rows.has(ck)) return COMP.rows.get(ck);
  const sh = COMP.shards[date.slice(0, 7)], raw = sh && sh.days[date] && sh.days[date][key];
  const rows = raw ? raw.map((r) => ({ pos: r[0], id: r[1], ad: !!(r[2] & 1), plus: !!(r[2] & 2), price: r[3], coupon: r[4], ship: r[5], sold: r[6] })) : [];
  COMP.rows.set(ck, rows);
  return rows;
}

// this project's eBay keywords ("DE|keyword") and its own listing IDs
function compScope(project) {
  const ebay = Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === "ebay");
  const keys = [], labels = {}, own = {};
  ebay.forEach((it) => {
    own[String(it.product_id)] = it.sku || "";
    uniq(it.rows.map((r) => r.keyword)).forEach((k) => { const key = `${it.country || "DE"}|${k}`; if (!(key in labels)) { labels[key] = k; keys.push(key); } });
  });
  keys.sort((a, b) => labels[a].localeCompare(labels[b], LOCALE()));
  return { ebay, keys, labels, own };
}
const sellerOf = (id) => (COMP.items[id] && COMP.items[id].seller) || "";
function ownSellers(scope) {
  const set = new Set(Array.isArray(SETTINGS.own_sellers) ? SETTINGS.own_sellers : []);
  Object.keys(scope.own).forEach((id) => { if (sellerOf(id)) set.add(sellerOf(id)); });
  return set;
}
const eur = (cents) => (cents / 100).toLocaleString(LOCALE(), { style: "currency", currency: "EUR" });
const median = (nums) => { if (!nums.length) return null; const a = [...nums].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

function sovFor(date, keys) {
  const per = {};
  let total = 0;
  keys.forEach((k) => compRows(date, k).forEach((r) => {
    if (r.pos > 10) return;
    const pts = 11 - r.pos, name = sellerOf(r.id);
    total += pts;
    const e = (per[name] = per[name] || { name, pts: 0, slots: 0, top3: 0, ads: 0, kws: new Set() });
    e.pts += pts; e.slots++; if (r.pos <= 3) e.top3++; if (r.ad) e.ads++; e.kws.add(k);
  }));
  return { per, total };
}

// units sold per listing: the change in its (exact) sold count between the first and the last day it was seen
function salesEstimates(keys, dates) {
  const first = {}, last = {}, latest = {};
  dates.forEach((d) => keys.forEach((k) => compRows(d, k).forEach((r) => {
    if (r.price != null && (!latest[r.id] || d >= latest[r.id].d)) latest[r.id] = { d, price: r.price };
    if (r.sold == null || r.plus) return;
    if (!first[r.id]) first[r.id] = { d, v: r.sold };
    if (!last[r.id] || d > last[r.id].d || (d === last[r.id].d && r.sold > last[r.id].v)) last[r.id] = { d, v: r.sold };
  })));
  const out = [];
  Object.keys(first).forEach((id) => {
    const days = daysBetween(first[id].d, last[id].d), delta = last[id].v - first[id].v;
    if (days >= 1 && delta > 0) out.push({ id, delta, perDay: delta / days, days, price: latest[id] ? latest[id].price : null });
  });
  return out.sort((a, b) => b.perDay - a.perDay || b.delta - a.delta);
}

function previousSold(date, key, id) {
  const i = COMP.dates.indexOf(date);
  for (let j = i - 1; j >= Math.max(0, i - 14); j--) {
    const r = compRows(COMP.dates[j], key).find((x) => x.id === id && x.sold != null && !x.plus);
    if (r) return r.sold;
  }
  return null;
}

function sparkSVG(vals, w = 96, h = 24) {
  const nums = vals.filter((v) => v !== null);
  if (vals.length < 2 || !nums.length) return "";
  const hi = Math.max(...nums, 1e-9);
  let path = "", pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    path += `${pen ? " L" : " M"}${(2 + (i / (vals.length - 1)) * (w - 4)).toFixed(1)} ${(h - 3 - (v / hi) * (h - 6)).toFixed(1)}`; pen = true;
  });
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${path.trim()}"/></svg>`;
}

function priceBarsSVG(rows, own, med) {
  const top = rows.filter((r) => r.pos <= 10), prices = top.map((r) => r.price).filter((v) => v !== null && v !== undefined);
  if (!prices.length) return "";
  const W = 480, H = 160, L = 8, R = 8, T = 16, B = 22, pw = W - L - R, ph = H - T - B, hi = Math.max(...prices, med || 0) * 1.12;
  const Y = (v) => T + ph - (v / hi) * ph, slot = pw / 10, bw = slot * 0.62;
  let g = "";
  for (let p = 1; p <= 10; p++) {
    const r = top.find((x) => x.pos === p), cx = L + (p - 0.5) * slot;
    if (r && r.price !== null && r.price !== undefined) g += `<rect class="pb ${r.ad ? "pb-ad" : "pb-org"}${own[r.id] !== undefined ? " pb-own" : ""}" x="${(cx - bw / 2).toFixed(1)}" y="${Y(r.price).toFixed(1)}" width="${bw.toFixed(1)}" height="${(T + ph - Y(r.price)).toFixed(1)}"><title>#${p}: ${esc(eur(r.price))}</title></rect>`;
    g += `<text class="pb-x" x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle">${p}</text>`;
  }
  if (med) g += `<line class="pb-med" x1="${L}" x2="${W - R}" y1="${Y(med).toFixed(1)}" y2="${Y(med).toFixed(1)}"/><text class="pb-medl" x="${W - R}" y="${(Y(med) - 4).toFixed(1)}" text-anchor="end">${esc(t("median"))} ${esc(eur(med))}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="pb-svg" role="img" aria-label="${esc(t("priceByPos"))}">${g}</svg>`;
}

function renderCompetitors() {
  const root = document.getElementById("compRoot");
  if (!root) return;
  const project = currentProject(), scope = compScope(project);
  if (!scope.ebay.length) { root.innerHTML = `<div class="empty-state">${esc(t("compEbayOnly"))}</div>`; return; }
  if (COMP.status === "idle" || COMP.status === "loading") { root.innerHTML = `<div class="empty-state">${esc(t("compLoading"))}</div>`; return; }
  if (COMP.status === "empty") { root.innerHTML = `<div class="empty-state">${esc(t("compNone"))}</div>`; return; }
  if (!scope.keys.length) { root.innerHTML = `<div class="empty-state">${esc(t("compNoKeywords"))}</div>`; return; }

  const datesDesc = [...COMP.dates].reverse();
  if (!state.compDate || !COMP.dates.includes(state.compDate)) state.compDate = datesDesc[0];
  const date = state.compDate;
  if (!state.compKw || !scope.keys.includes(state.compKw)) state.compKw = scope.keys.find((k) => compRows(date, k).length) || scope.keys[0];
  const key = state.compKw, kw = scope.labels[key], country = key.split("|")[0];
  const rows = compRows(date, key), top10 = rows.filter((r) => r.pos <= 10);
  const mine = ownSellers(scope);
  const multiCountry = new Set(scope.keys.map((k) => k.split("|")[0])).size > 1;
  const startDate = shiftDate(date, -(state.compDays - 1));
  const rangeDates = COMP.dates.filter((d) => d >= startDate && d <= date);

  // ---- the selected keyword on the selected day
  const named = top10.filter((r) => sellerOf(r.id)), distinct = new Set(named.map((r) => sellerOf(r.id))).size;
  const ads = top10.filter((r) => r.ad).length;
  const med = median(top10.map((r) => r.price).filter((v) => v !== null && v !== undefined));
  const ownRows = rows.filter((r) => scope.own[r.id] !== undefined);
  const best = ownRows.length ? ownRows.reduce((a, b) => (b.pos < a.pos ? b : a)) : null;
  const bestOrganic = best ? rows.filter((r) => r.pos <= best.pos && !r.ad).length : null;
  const yourPrice = best && best.price != null && med ? { p: eur(best.price), d: (best.price >= med ? "+" : "−") + pct(Math.abs(best.price / med - 1) * 100, 0) } : null;
  const card = (label, value, sub) => `<div class="card"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="comp-sub">${sub}</div>` : ""}</div>`;
  const kpis = rows.length ? `<div class="summary-grid comp-kpis">
      ${card(t("kpiSellers"), distinct, esc(t("kpiSellersSub", { n: named.length, m: top10.length - named.length })))}
      ${card(t("kpiAds"), `${ads} <span class="of">${esc(t("kpiAdsSub"))}</span>`, "")}
      ${card(t("kpiMedian"), med !== null ? esc(eur(med)) : "–", yourPrice ? esc(t("kpiYourPrice", yourPrice)) : esc(best ? t("kpiNoPrice") : ""))}
      ${card(t("kpiYourPos"), best ? best.pos : "–", best ? esc(t("kpiYourPosSub", { o: bestOrganic })) : esc(t("kpiNotInTop", { n: rows.length || 20 })))}
    </div>` : "";

  // ---- the listing table
  const listing = rows.map((r) => {
    const m = COMP.items[r.id], isOwn = scope.own[r.id] !== undefined, seller = sellerOf(r.id);
    const prev = r.sold != null && !r.plus ? previousSold(date, key, r.id) : null;
    const since = prev !== null ? (r.sold - prev >= 0 ? "+" : "−") + Math.abs(r.sold - prev) : "–";
    const title = m ? esc(m.title) : `<span class="comp-muted">${esc(t("imageSlot"))}</span>`;
    return `<tr class="${isOwn ? "own" : ""}${r.ad ? " is-ad" : ""}">
      <td class="pos">${r.pos}${r.ad ? ` <span class="badge-ad">${esc(t("adBadge"))}</span>` : ""}</td>
      <td class="lst"><a href="https://www.${EBAY_SITES[country] || "ebay.de"}/itm/${esc(r.id)}" target="_blank" rel="noopener">${title}</a>${isOwn ? ` <span class="badge-own">${esc(t("yoursBadge"))}${scope.own[r.id] ? " · " + esc(scope.own[r.id]) : ""}</span>` : ""}</td>
      <td>${seller ? `${esc(seller)}${mine.has(seller) ? ` <span class="badge-own">${esc(t("youBadge"))}</span>` : ""}` : `<span class="comp-muted">${esc(t("unnamedSeller"))}</span>`}</td>
      <td class="num">${m && m.fb != null ? esc(pct(m.fb / 10, 1)) + (m.fbn != null ? ` <span class="comp-muted">(${esc(m.fbn.toLocaleString(LOCALE()))})</span>` : "") : "–"}</td>
      <td class="num">${r.price != null ? esc(eur(r.price)) : "–"}${r.coupon != null ? `<div class="comp-muted">${esc(eur(r.coupon))} ${esc(t("withCoupon"))}</div>` : ""}</td>
      <td class="num">${r.ship === 0 ? esc(t("freeDelivery")) : r.ship != null ? "+" + esc(eur(r.ship)) : "–"}</td>
      <td class="num">${r.sold != null ? (r.plus ? esc(t("atLeast")) + " " : "") + esc(r.sold.toLocaleString(LOCALE())) : "–"}</td>
      <td class="num">${esc(since)}</td></tr>`;
  }).join("");
  const listingHTML = rows.length
    ? `<div class="comp-panel"><div class="comp-head"><h3>${esc(t("compTitleKw", { kw }))}</h3></div>
        <div class="comp-split"><div class="comp-chart">${priceBarsSVG(rows, scope.own, med)}</div></div>
        <div class="grid-wrap"><table class="comp-table"><thead><tr><th>${esc(t("thPos"))}</th><th>${esc(t("thListing"))}</th><th>${esc(t("thSeller"))}</th><th class="num">${esc(t("thFeedback"))}</th><th class="num">${esc(t("thPrice"))}</th><th class="num">${esc(t("thDelivery"))}</th><th class="num">${esc(t("thSold"))}</th><th class="num">${esc(t("thSoldSince"))}</th></tr></thead><tbody>${listing}</tbody></table></div></div>`
    : `<div class="empty-state">${esc(t("compNoKw"))}</div>`;

  // ---- seller share of voice across the project's keywords
  const today = sovFor(date, scope.keys);
  const series = rangeDates.map((d) => sovFor(d, scope.keys));
  const names = Object.values(today.per).filter((e) => e.name).sort((a, b) => b.pts - a.pts);
  const shown = names.slice(0, 12), others = today.per[""];
  const share = (e, tot) => (tot ? (e.pts / tot) * 100 : 0);
  const sovRow = (e) => {
    const trend = series.map((s) => (s.per[e.name] && s.total ? (s.per[e.name].pts / s.total) * 100 : series.length ? 0 : null));
    return `<tr class="${mine.has(e.name) ? "own" : ""}"><td>${esc(e.name)}${mine.has(e.name) ? ` <span class="badge-own">${esc(t("youBadge"))}</span>` : ""}</td>
      <td class="num"><div class="bar"><i style="width:${Math.min(100, share(e, today.total)).toFixed(1)}%"></i></div> ${esc(pct(share(e, today.total), 1))}</td>
      <td class="num">${e.slots}</td><td class="num">${e.top3}</td><td class="num">${e.kws.size}</td><td class="num">${e.ads}</td><td>${sparkSVG(trend)}</td></tr>`;
  };
  const sovHTML = today.total
    ? `<div class="comp-panel"><div class="comp-head"><h3>${esc(t("sovTitle", { date: fmtFull(date) }))}</h3></div><p class="comp-note">${esc(t("sovHint"))}</p>
        <div class="grid-wrap"><table class="comp-table"><thead><tr><th>${esc(t("thSeller"))}</th><th class="num">${esc(t("thShare"))}</th><th class="num">${esc(t("thSlots"))}</th><th class="num">${esc(t("thTop3"))}</th><th class="num">${esc(t("thKeywords"))}</th><th class="num">${esc(t("thAsAd"))}</th><th>${esc(t("thTrendCol"))}</th></tr></thead>
        <tbody>${shown.map(sovRow).join("")}${others ? `<tr class="others"><td>${esc(t("othersRow"))}</td><td class="num">${esc(pct(share(others, today.total), 1))}</td><td class="num">${others.slots}</td><td class="num">${others.top3}</td><td class="num">${others.kws.size}</td><td class="num">${others.ads}</td><td></td></tr>` : ""}</tbody></table></div></div>`
    : "";

  // ---- estimated sales
  const sales = salesEstimates(scope.keys, rangeDates).slice(0, 10);
  const salesRows = sales.map((s) => `<tr class="${scope.own[s.id] !== undefined ? "own" : ""}"><td class="lst"><a href="https://www.${EBAY_SITES[country] || "ebay.de"}/itm/${esc(s.id)}" target="_blank" rel="noopener">${COMP.items[s.id] ? esc(COMP.items[s.id].title) : esc(s.id)}</a>${scope.own[s.id] !== undefined ? ` <span class="badge-own">${esc(t("yoursBadge"))}</span>` : ""}</td>
      <td>${sellerOf(s.id) ? esc(sellerOf(s.id)) : `<span class="comp-muted">${esc(t("unnamedSeller"))}</span>`}</td><td class="num">${esc(s.delta.toLocaleString(LOCALE()))}</td><td class="num">${esc(nf(s.perDay, 1))}</td><td class="num">${s.price != null ? esc(eur(s.price)) : "–"}</td></tr>`).join("");
  const salesHTML = `<div class="comp-panel"><div class="comp-head"><h3>${esc(t("salesTitle"))}</h3></div><p class="comp-note">${esc(t("salesHint"))}</p>
      ${sales.length ? `<div class="grid-wrap"><table class="comp-table"><thead><tr><th>${esc(t("thListing"))}</th><th>${esc(t("thSeller"))}</th><th class="num">${esc(t("thSoldPeriod"))}</th><th class="num">${esc(t("thPerDay"))}</th><th class="num">${esc(t("thPrice"))}</th></tr></thead><tbody>${salesRows}</tbody></table></div>` : `<div class="empty-state small">${esc(t("noSales"))}</div>`}</div>`;

  const kwOptions = scope.keys.map((k) => `<option value="${esc(k)}" ${k === key ? "selected" : ""}>${esc(scope.labels[k])}${multiCountry ? " · " + esc(k.split("|")[0]) : ""}</option>`).join("");
  const dateOptions = datesDesc.slice(0, 90).map((d) => `<option value="${d}" ${d === date ? "selected" : ""}>${esc(fmtFull(d))}</option>`).join("");
  const periodOptions = [14, 30, 90].map((n) => `<option value="${n}" ${n === state.compDays ? "selected" : ""}>${esc(t("lastDays", { n }))}</option>`).join("");
  const link = marketplaceUrl({ marketplace: "ebay", country }, kw);
  root.innerHTML = `<div class="comp-controls">
      <label class="md-label" for="compKw">${esc(t("compKeyword"))}</label><select id="compKw" class="comp-select">${kwOptions}</select>
      <label class="md-label" for="compDate">${esc(t("compDay"))}</label><select id="compDate">${dateOptions}</select>
      <label class="md-label" for="compDays">${esc(t("compTrend"))}</label><select id="compDays">${periodOptions}</select>
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${esc(t("openOn", { mp: "eBay" }))}</a>` : ""}</div>
    ${kpis}${listingHTML}${sovHTML}${salesHTML}<p class="comp-note">${esc(t("compNote"))}</p>`;
  const again = () => safely("compRoot", renderCompetitors);
  document.getElementById("compKw").addEventListener("change", (e) => { state.compKw = e.target.value; again(); });
  document.getElementById("compDate").addEventListener("change", (e) => { state.compDate = e.target.value; again(); });
  document.getElementById("compDays").addEventListener("change", (e) => { state.compDays = Number(e.target.value); again(); });
}

// ---------- The rank tables ----------
function cellHTML(v, tip, scanned, pop) {
  if (v === undefined) return `<td class="nodata" title="${tip} — ${esc(t("notChecked"))}">·</td>`;
  if (v === "BLOCKED") return `<td class="rank-cell r-blocked" title="${tip} — ${esc(t("blockedTip"))}">?</td>`;
  if (v === null) return `<td class="rank-cell r-nf" title="${tip} — ${esc(t("notFoundTip"))}">${scanned ? `&gt;${scanned}` : "–"}</td>`;
  const h = heat(v);
  if (pop) return `<td class="rank-cell has-pop" style="background:${h.bg};color:${h.fg}" data-pop="${pop}" tabindex="0">${v}</td>`;
  return `<td class="rank-cell" style="background:${h.bg};color:${h.fg}" title="${tip}">${v}</td>`;
}
function dayHeaderHTML(label) {
  const m = /^(\d+)\.?\s+(.*)$/.exec(label) || /^(.*?)\s+(\d+)$/.exec(label);   // "23. Okt." (German) or "Oct 23" (English)
  return m ? `<div class="d">${esc(m[1].length <= 2 ? m[1] : m[2])}</div><div class="mon">${esc(m[1].length <= 2 ? m[2] : m[1])}</div>` : esc(label);
}

const SORT_DEFAULT_DIR = { name: 1, now: 1, best: 1, avg: 1, change: -1, found: -1 };

function renderTable() {
  document.dispatchEvent(new Event("rankpop-reset"));
  const bestView = !!currentItem().synthetic;      // "All <marketplace> products — best position" is selected
  const project = currentProject();
  const rows = VIEW.rows;
  const byKw = "keyword";
  const entityIds = uniq(rows.map((r) => r[byKw]));
  const rawDates = uniq(rows.map((r) => r.date)).sort();
  const firstDate = rawDates[0], latestDate = rawDates[rawDates.length - 1];

  const byEnt = {};
  rows.forEach((r) => { (byEnt[r[byKw]] = byEnt[r[byKw]] || {})[r.date] = r; });
  const hasCell = (id, d) => Object.prototype.hasOwnProperty.call(byEnt[id] || {}, d);
  const cell = (id, d) => byEnt[id][d];
  const labelText = (id) => id;
  const labelHTML = (id) => `<span class="kw-name" data-kw="${esc(id)}" tabindex="0" role="button" title="${esc(t("kwTitle"))}">${esc(id)}</span>`;

  const dayValue = (id, d) => { if (!hasCell(id, d)) return undefined; const r = cell(id, d); return r.blocked ? "BLOCKED" : r.rank; };
  const bucketValue = (id, dates) => {
    const present = dates.filter((d) => hasCell(id, d) && !cell(id, d).blocked);
    if (!present.length) return dates.some((d) => hasCell(id, d)) ? "BLOCKED" : undefined;
    const m = mean(present.map((d) => cell(id, d).rank));
    return m === null ? null : Math.round(m);
  };

  let columns, getValue;
  if (state.range === "daily") {
    // A continuous run of days ending at the latest check, newest first. Days not
    // tracked yet show "·", so the table already has its full shape on day one.
    let span = latestDate ? daysBetween(firstDate, latestDate) + 1 : 0;
    if (latestDate) span = Math.max(span, MIN_DAILY_COLUMNS);
    if (state.days !== "all") span = Math.min(span, state.days);
    columns = [];
    for (let i = 0; i < span; i++) { const d = shiftDate(latestDate, -i); columns.push({ key: d, label: fmtDateShort(d) }); }
    getValue = dayValue;
  } else {
    const buckets = {};
    const keyOf = state.range === "weekly" ? isoWeekStart : monthKey;
    rawDates.forEach((d) => { (buckets[keyOf(d)] = buckets[keyOf(d)] || []).push(d); });
    columns = Object.keys(buckets).sort().reverse().map((k) => ({ key: k, label: state.range === "weekly" ? t("weekPrefix") + " " + fmtDateShort(k) : monthLabel(k) }));
    getValue = (id, k) => bucketValue(id, buckets[k]);
  }

  // Per-row summary: latest usable check, best, average, share of checks found, and change.
  const stats = (id) => {
    const ds = rawDates.filter((d) => hasCell(id, d) && !cell(id, d).blocked);
    if (!ds.length) return { now: undefined, nowDate: null, bestDate: null, best: null, avg: null, found: null, prev: undefined, scanned: null, delta: null, kind: null };
    const ranks = ds.map((d) => cell(id, d).rank);
    const found = ranks.filter((r) => r !== null);
    const now = ranks[ranks.length - 1], prev = ranks.length > 1 ? ranks[ranks.length - 2] : undefined;
    const nowDate = ds[ds.length - 1];
    let bestDate = null;
    ds.forEach((d) => { const r = cell(id, d).rank; if (r !== null && (bestDate === null || r <= cell(id, bestDate).rank)) bestDate = d; });
    let delta = null, kind = null;
    if (prev !== undefined) {
      if (prev === null && now !== null) kind = "new";
      else if (prev !== null && now === null) kind = "lost";
      else if (prev !== null && now !== null) { delta = prev - now; kind = delta > 0 ? "improved" : delta < 0 ? "dropped" : "same"; }
    }
    return { now, nowDate, bestDate, best: found.length ? Math.min(...found) : null, avg: found.length ? mean(found) : null,
      found: (found.length / ranks.length) * 100, prev, scanned: cell(id, ds[ds.length - 1]).results_scanned, delta, kind };
  };
  const st = {};
  entityIds.forEach((id) => { st[id] = stats(id); });

  // Quick insight: what moved since the previous check
  const kinds = { improved: 0, dropped: 0, new: 0, lost: 0 };
  entityIds.forEach((id) => { if (st[id].kind in kinds) kinds[st[id].kind]++; });
  const anyPrev = entityIds.some((id) => st[id].prev !== undefined);

  const passes = (id) => {
    const s = st[id], f = state.filter;
    if (f === "top3") return s.now !== undefined && s.now !== null && s.now <= 3;
    if (f === "top10") return s.now !== undefined && s.now !== null && s.now <= 10;
    if (f === "top100") return s.now !== undefined && s.now !== null && s.now <= 100;
    if (f === "notfound") return s.now === null;
    if (["improved", "dropped", "new", "lost"].includes(f)) return s.kind === f;
    return true;
  };
  const q = state.q.trim().toLowerCase();
  const sortVal = (id) => {
    const s = st[id], k = state.sort.key;
    if (k === "name") return labelText(id).toLowerCase();
    if (k === "now") return s.now === undefined ? null : s.now;
    if (k === "best") return s.best; if (k === "avg") return s.avg; if (k === "found") return s.found;
    if (k === "change") return s.kind === "new" ? 9999 : s.kind === "lost" ? -9999 : s.delta;
    return null;
  };
  const ids = entityIds.filter((id) => passes(id) && (!q || labelText(id).toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      if (va === null && vb === null) return labelText(a).localeCompare(labelText(b));
      if (va === null) return 1; if (vb === null) return -1;
      const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return c * state.sort.dir || labelText(a).localeCompare(labelText(b));
    });

  LAST_GRID = { firstHeader: "Keyword", columns, entities: ids.map((id) => ({ id, label: labelText(id) })), getValue };

  // toolbar: filter + search on the left, movement chips in the middle, export on the right
  const chip = (f, text, n) => `<button class="mv ${state.filter === f ? "on" : ""}" data-f="${f}"${n ? "" : " disabled"}>${text} <b>${n}</b></button>`;
  const fopts = [["all", t("fAll")], ["top3", t("fTop3")], ["top10", t("fTop10")], ["top100", t("fTop100")], ["notfound", t("fNotFound")], ["improved", t("fImproved")], ["dropped", t("fDropped")], ["new", t("fNew")], ["lost", t("fLost")]]
    .map(([v, l]) => `<option value="${v}" ${state.filter === v ? "selected" : ""}>${esc(l)}</option>`).join("");
  document.getElementById("tableToolbar").innerHTML = `
    <div class="ctrl-group"><select id="filterSelect" title="${esc(t("filterTitle"))}">${fopts}</select>
      <input class="search-input" id="kwSearch" placeholder="${esc(t("filterPh"))}" value="${esc(state.q)}" /></div>
    <div class="movers">${anyPrev
      ? `<span class="mv-label">${esc(t("sincePrev"))}</span>${chip("improved", esc(t("mvUp")), kinds.improved)}${chip("dropped", esc(t("mvDown")), kinds.dropped)}${chip("new", esc(t("mvNew")), kinds.new)}${chip("lost", esc(t("mvLost")), kinds.lost)}`
      : `<span class="mv-label">${esc(t("movementAfter"))}</span>`}</div>
    <div class="ctrl-group"><button class="btn" id="exportBtn">${esc(t("exportCsv"))}</button></div>`;
  document.getElementById("filterSelect").addEventListener("change", (e) => { state.filter = e.target.value; renderTable(); });
  document.getElementById("kwSearch").addEventListener("input", (e) => { state.q = e.target.value; renderTable(); const s = document.getElementById("kwSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.querySelectorAll("#tableToolbar .mv").forEach((b) => b.addEventListener("click", () => { state.filter = state.filter === b.dataset.f ? "all" : b.dataset.f; renderTable(); }));

  document.getElementById("gridLegend").innerHTML = legendHTML() + (bestView ? ` <span class="legend-hint">· ${t("legendHint")}</span>` : "");

  const arrow = (k) => (state.sort.key === k ? (state.sort.dir === 1 ? " ▲" : " ▼") : "");
  const th = (k, text, tip, extra = "") => `<th class="metric sortable ${extra}" data-sort="${k}" title="${tip}">${text}${arrow(k)}</th>`;
  const head = `<thead><tr>
    <th class="kwcol sortable" data-sort="name">${esc(t("thKeyword", { n: ids.length }))}${arrow("name")}</th>
    ${th("now", esc(t("thNow")), esc(t("thNowTip")))}${th("best", esc(t("thBest")), esc(t("thBestTip")))}
    ${th("avg", esc(t("thAvg")), esc(t("thAvgTip")))}${th("found", esc(t("thFound")), esc(t("thFoundTip")))}
    ${th("change", esc(t("thChange")), esc(t("thChangeTip")), "metric-last")}
    ${columns.map((c) => `<th class="day">${state.range === "daily" ? dayHeaderHTML(c.label) : esc(c.label)}</th>`).join("")}</tr></thead>`;

  POP = {};
  const popFor = (id, date) => {                       // pop-up data for keyword `id` on `date`, or null
    if (!bestView || !date || !hasCell(id, date)) return null;
    const r = cell(id, date);
    if (!r.holder || r.rank === null || r.rank === undefined) return null;
    const key = "p" + Object.keys(POP).length;
    POP[key] = { kw: id, date, holder: r.holder, sku: r.holder_sku || "", id: r.holder_id || "", rank: r.rank, n: r.found_n, others: r.others || [], tied: r.tied || [] };
    return key;
  };
  const body = ids.map((id) => {
    const s = st[id];
    const nowN = s.now === undefined ? 9999 : s.now === null ? 9999 : s.now;
    const tag = nowN === 1 ? '<span class="kw-tag">#1</span>' : nowN <= 3 ? '<span class="kw-tag">TOP 3</span>' : "";
    const nowCell = s.now === undefined ? `<td class="metric nodata">·</td>` : cellHTML(s.now, `${esc(labelText(id))} · ${esc(t("posAtLatest"))}`, s.scanned, s.now === null ? null : popFor(id, s.nowDate)).replace("<td ", '<td data-m="now" ').replace('class="rank-cell', 'class="metric rank-cell');
    const change = s.kind === "new" ? `<span class="trend-down"><i>●</i> ${esc(t("newT"))}</span>` : s.kind === "lost" ? `<span class="trend-up"><i>✕</i> ${esc(t("lostT"))}</span>`
      : s.kind === "improved" ? `<span class="trend-down"><i>▲</i> ${s.delta}</span>` : s.kind === "dropped" ? `<span class="trend-up"><i>▼</i> ${-s.delta}</span>`
      : s.kind === "same" ? `<span class="trend-flat">=</span>` : `<span class="trend-flat">–</span>`;
    const cells = columns.map((c) => {
      const v = getValue(id, c.key);
      const r0 = state.range === "daily" && hasCell(id, c.key) ? cell(id, c.key) : null;
      const carried = state.range === "daily" && hasCell(id, c.key) && cell(id, c.key).carried;
      const tip = esc(labelText(id) + " · " + c.key + (r0 && r0.holder ? " · " + t("bestColon") + ": " + r0.holder : "") + (carried ? " · " + t("carriedTip") : ""));
      return cellHTML(v, tip, state.range === "daily" && v === null ? cell(id, c.key).results_scanned : null, state.range === "daily" && typeof v === "number" ? popFor(id, c.key) : null);
    }).join("");
    return `<tr><td class="kwcol">${labelHTML(id)}${tag}</td>${nowCell}
      ${(() => { const pk = s.best === null ? null : popFor(id, s.bestDate); return `<td class="metric${pk ? " has-pop" : ""}"${pk ? ` data-pop="${pk}" tabindex="0"` : ""}>${s.best === null ? "–" : s.best}</td>`; })()}<td class="metric">${s.avg === null ? "–" : nf(s.avg, 1)}</td>
      <td class="metric">${s.found === null ? "–" : pct(Math.round(s.found))}</td><td class="metric metric-last">${change}</td>${cells}</tr>`;
  }).join("");

  document.getElementById("rankGrid").innerHTML = head + `<tbody>${body || `<tr><td class="kwcol" colspan="${columns.length + 6}">${esc(t("noMatch"))}</td></tr>`}</tbody>`;
  document.querySelectorAll("#rankGrid th.sortable").forEach((h) => h.addEventListener("click", () => {
    const k = h.dataset.sort;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: SORT_DEFAULT_DIR[k] };
    renderTable();
  }));
}

function legendHTML() {
  const chips = [2, 7, 25, 70, 200].map((r, i) => { const h = heat(r); return `<span class="chip" style="background:${h.bg};color:${h.fg}">${["1–3", "4–10", "11–50", "51–100", ">100"][i]}</span>`; }).join("");
  return `${esc(t("legendMain"))} ${chips}
    <span class="chip r-nf">${t("legendNf")}</span><span class="chip r-blocked">?</span> ${esc(t("legendBlocked"))} &nbsp;·&nbsp; <b>·</b> ${esc(t("legendNotChecked"))}`;
}

// ---------- CSV export ----------
function buildCsv() {
  const { firstHeader, columns, entities, getValue } = LAST_GRID;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [[firstHeader, ...columns.map((c) => c.key)].map(q).join(",")];
  entities.forEach((e) => {
    const vals = columns.map((c) => {
      const v = getValue(e.id, c.key);
      return v === undefined || v === null ? "" : v === "BLOCKED" ? t("csvBlocked") : v;
    });
    lines.push([q(e.label), ...vals].join(","));
  });
  return lines.join("\n");
}

function exportCSV() {
  if (!LAST_GRID) return;
  const blob = new Blob(["\ufeff" + buildCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ranks-${state.range}.csv`.replace(/[^\w.-]+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

boot();
