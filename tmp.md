Let's re-design this.

  First. Design a sqlite3 db that we'll store in apps/.

  We'll have the app name, then a table issue, issue will have a scout, fix and judgement agent and potentially elevated - elevated means elevated for human review.

issue has scout_report, fix_report and judge_report which is the text block from the mds, and a finding number that should match what's in the md

  then we'll a table run, each issue belongs to a run. each run belongs to an app. Then a table agent, type=scout/fixer/judge

  a table cost, which is cost entries

  Each cost has an agent and it has total input, total out, model(from agent, not directly in table), cache reads/writes, cost in, cost out, cost total


1. orchestrator runs the scouts. scouts save to the mds as before.

a skill is made to work with the sqlite db. doc-review-db-manager skill

orchestrator waits for scouts to finish, then reads the mds, deduplicates and writes to the db and calls the fixes with the grouped issues the same way as before except with duplicates removed. It should make a decision which to keep, ie, if there's a performance and edge-cases, then it should decide which type to keep and which to discard. BUT, in the db, the issue can belong to multiple scouts so we know which ones were dupliated, ie, an issue could belong to a edge-cases scout and a security scout. or any other combination. could be 3+, but probably rare.

the fixes write as before to the mds, then the orchestrator reads them, uses the skill to add to db, and calls the judge 

same with the judge. write to md. orchestrator reads when ready, writes to db all the info.

orchestrator should also be writing the cost data, so that's in the db.

Then, make a command /doc-report # where # is the run number.

this will give a report for the user, including detailing all the elevated decisions.

the orchestrator when run with an app name, will start the reviews for that app

or if we run orchestrator app elevated then it'll go into a dialogue mode where you can instruct it what to do with the elevated issues, and as it deals with them, it'll update the db appropriately. 

we can have a flag human_elevated_report - which is what the human said about it.

human_fixed = the human approved fixing
human_dismissed = the human dismissed it
