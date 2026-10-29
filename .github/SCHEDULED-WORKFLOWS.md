# Scheduled workflows: keep-alive note

GitHub disables every scheduled workflow in this repo after 60 days with no commits.
The ingestion jobs (including the Flex and exchange feeds behind daily NAV) depend on these schedules.

If GitHub emails that a workflow "will be disabled soon", any commit to main resets the 60-day count for all of them.

Last keep-alive: 2026-10-29
