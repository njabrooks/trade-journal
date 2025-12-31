1. Feature requirements by page
    1.1. /research/[id]
        1.1.1. The Metadata section: should be more compact, it uses too much screen space currently.
        1.1.2. The Workflow Status: could also be more compact. "12 claims converted to hierarchy" is no longer accurate. Perhaps something like "12 claims linked ot theses"?
        1.1.3. Perhaps combine Metadata and Workflow Status sections? Or put them side by side? 
        1.1.4. The key purpose of research detail pages is to review the claims and confirm them by linking them to macro or asset theses. It is good therefore that UnifiedClaimsBrowser.tsx is the primary focus of the page.
    1.2. /research/claims
        1.2.1. Filters: Needs a 'Linked To' filter. List all existing Macro and Asset Theses and allow multi-select as well as null/unlinked selection option.
    1.3. /theses
        1.3.1. Rename page path from /theses to /macro-theses
        1.3.2. Make the Macro Thesis table follow the formatting and style of UnifiedClaimsBrowser.tsx i.e. UnifiedMacroThesisBrowser.tsx
            1.3.2.1. Columns: Title, Type, Time Horizon, Confidence, Status, Asset Theses, Strategies
            1.3.2.2. As with the Status field in UnifiedClaimsBrowser.tsx, the Asset Theses field should allow the user to enter a linking process between Macro Thesis and Asset Thesis.
    1.4. /theses/[id]
        1.4.1. In the 'Edit' thesis feature, add ability to delete the macro-thesis record.
        1.4.2. Make Overview section more compact.
        1.4.3. Change Description section to Summary.
        1.4.4. Create a CLAUDE SKILL to generate a summarisation of the macro thesis in the Summary section based on the linked Main Claims. Make the Summary section editable.
        1.4.5. Move the Notes section to the bottom.
        1.4.6. Change the Main Claims section to be the UnifiedClaimsBrowser.tsx filtered for claims 'Linked To' the thesis. Change the 2nd column displayed on primary rows from 'Linked To' to 'Source'.
        1.4.7. Rename Linked Asset Thesiss section 'Linked Asset Theses'. Use the UnifiedAssetThesisBrowser.tsx (see 1.5.1)
        1.4.8. Use the UnifiedStrategiesBrowser.tsx in Linked Strategies section (see 1.7.1)
    1.5. /asset-theses
        1.5.1. Make the Macro Thesis table follow the formatting and style of UnifiedClaimsBrowser.tsx i.e. UnifiedAssetThesisBrowser.tsx
            1.5.1.1. Columns: Title, Underlying, Time Horizon, Confidence, Status, Macro Theses, Strategies
            1.5.1.2. As with the Status field in UnifiedClaimsBrowser.tsx, the Macro Theses field should allow the user to enter a linking process between Macro Theses and Asset Theses, and the the Strategies field should allow the user to enter a linking process between Asset Theses and Strategies.
    1.6. /asset-theses/[id]
        1.6.0. The 'Link to Macro Thesis' feature in ClientHierarchyBreadcrumb.tsx is not populating with Macro Thesis records. Needs a fix.
        1.6.1. In the 'Edit' asset-thesis feature, add ability to delete the asset-thesis record.
        1.6.2. Make Overview section more compact.
        1.6.3. Change Description section to Summary and move above Underlying Market Data.
        1.6.4. Create a CLAUDE SKILL to generate a summarisation of the Asset Thesis in the Summary section based on the linked Main Claims. Make the Summary section editable.
        1.6.5. The Underlying Market Data is not populating with data. Fix and review the best data values to show.
        1.6.6. Change the Main Claims section to be the UnifiedClaimsBrowser.tsx filtered for claims 'Linked To' the thesis. Change the 2nd column displayed on primary rows from 'Linked To' to 'Source'.
        1.6.7. Add a 'Linked Macro Theses' section. Use the UnifiedMacroThesisBrowser.tsx (see 1.3.2)
        1.6.8. Use the UnifiedStrategiesBrowser.tsx in Linked Strategies section (see 1.7.1)
    1.7. /strategies
        1.7.1. Make the Strategies table follow the formatting and style of UnifiedClaimsBrowser.tsx i.e. UnifiedStrategiesBrowser.tsx
            1.7.1.1. Columns: Strategy, Account, State Code, Status, Asset Theses, Abs Notional, Unrealized, % NAV
                1.7.1.1.1. What other columns could be suitable here? 
            1.7.1.2. As with the Status field in UnifiedClaimsBrowser.tsx, the Asset Theses field should allow the user to enter a linking process between Strategies and Asset Theses.
        1.7.2. Integrate the /admin/strategies page into the /strategies page. This may involve having open and closed strategies sections to the UnifiedStrategiesBrowser.tsx. This task will require much more detailed thought to implement.
    1.8. /strategies/[id]
        1.8.0. The 'Link to Asset Thesis' feature in ClientHierarchyBreadcrumb.tsx is not populating with Asset Thesis records. Needs a fix.
        1.8.1. /admin/strategies features should be accessible for the specific [id] on this page.
        1.8.2. Performance, Triage and Blotter sections should be [id] filtered version of their main pages.
        1.8.3. Add a Playbook tab to the page which allows the user to focus in on more detailed decision making around the strategy. This would include a range of AI assisted evaluations to validate where and how there could be a completion/confirmation/invalidation of any of the strategy's Macro Thesis, Asset Thesis or Strategy (price action, options payoff charts, chart technicals and indicators etc.)
2. Bugs
    2.1. Obsidian sync. Can resolve later.
3. Bigger picture ideas
    3.1. Time-based, AI-assisted monitoring of evolving news and narrative flow affecting the Macro Thesis, Asset Thesis and Strategy for each Underlying with active positions.
    3.2. Enhance Blotter to log and journal every action carried out on Macro Thesis, Asset Thesis, Strategy and Position objects.
    3.3. Enhance Triage to capture all action triggers on Macro Thesis, Asset Thesis, Strategy and Position objects.
    3.4. Explore using CLAUDE to drastically enhance the UX/UI experience by making every action on the system executable through free text discussion with Claude, making the app itself more of a portal for visualising data and insights than executing db transactions. This could involve having labels and descriptors for core actions processes so the user can simply say for example, "link TSLA asset thesis to robotics macro thesis" and CLAUDE will take crae of the db transformations, rather than having to click and navigate multiple steps.
