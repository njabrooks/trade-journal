We want to standardise the linking components that enable the user to link objects together and improve the UX/UI.

1. Linkages by Unified[Object]Browser.tsx broswers:
    1.1. UnifiedClaimsBrowser.tsx
        1.1.1. Claim > Macro/Asset-theses (one-to-many, unified flow)
    1.2. UnifiedMacroThesisBrowser.tsx
        1.2.1. Macro-thesis > Asset-theses (one-to-many)
        1.2.2. Macro-thesis > Strategies (cannot be linked directly, linked indirectly via Asset-theses)
    1.3. UnifiedAssetThesisBrowser.tsx
        1.3.1. Asset-thesis > Macro-theses (one-to-many)
        1.3.2. Asset-thesis > Strategies (one-to-many)
    1.4. UnifiedStrategiesBrowser.tsx
        1.4.1. Strategies > Asset-thesis (one-to-one)
2. Linkage UX/UI
    2.1. In all browsers, the linked field should list the actual linked object(s), not just the count. Clicking on each linked object should click through to the [id] page of that object.
    2.2. In all browsers, the first column (listing the subject object i.e. Claims in UnifiedClaimsBrowser) should allow the user to click through to the detail [id] page.
    2.3. The Actions column, in addition to a downward arrow to expand the table, should have a 'Link' button which when clicked provides a dialogue for the user to manage all available links for the subject object covered anove in point 1. The Link should be context aware so that:
        2.3.1. The user can choose among valid link types (i.e. Macro/Asset-theses only for Claims, Asset-theses only for Macro-thesis, Macro-theses or Strategies for Asset-thesis, Asset-theses only for Strategies). Where only one linkage is available this step can be skipped.
        2.3.2. The user can choose between Link to Existing, Create New & Link.
            2.3.2.1. Link to Existing enables user to add and remove existing links.
            2.3.2.2. Create New & Link allows to create new objects through the form and link to the subject object.
3. Breadcrumbs where existing should provide access points to the same linking components.

i'd like to evaluate the above against existing ux/ui linking flows which are currently inconsistent. The flow and dialogue entered by clicking Confirmed in the Status field of the UnifiedClaimsBrowser is the strongest UX/UI so far, but it could benefit from adopting aspects of other flows. 

Hopefully this should all help standardise linking components and provide a more consistent user experience.