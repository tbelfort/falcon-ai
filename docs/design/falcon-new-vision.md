Brainstorm with me - We will make a plan to expand falcon-ai - It will go in specs/falcon-expand-1.md --

  Also move everything in specs/ to specs/archive - It's old now.

  We will replace linear and manually using claude code and codex to implement the workflows in @CORE/TASKS/WORKFLOW/

  The part where the user will be in claude code and codex will be the design phase.

  Part 1:

  Our own custom linear, that's built for our system.

  Decide on the tech stack for this. Pick based on what llms are likely best at. It'll be built and managed by agents.

  Probably react.

  It will have a kanban area where we can see all tasks in the workflow including backlog, todo, done and then all the stages in the workflow.

  Each agent has its name from the env variable. Each issue can assign anyone. When an agent assigns, the user is auto created if it didn't exist.

  We can manage users and view data about everything each agent has done so we have full logging.

  Can add humans. BOth a human AND an agent can be added.

  Agents add a human only when it needs human help.

  Labels can be added and managed.

  Built in labels will be

  bugs, data, docs, foundation, feature, migration, performance, refactor, security, test, ux

  State will be managed. These are different to labels.

  agent ready, agent working, needs human attention

  Attributes: has context pack, has spec, needs spec, needs context pack, needs tests, has tests

  These help manage what's needed and what's done for different types of issues. Not all will need full specs/context.

  Then we have a file manager. Context packs and specs are managed in a document manager with links and can be attached to issues.

  We have projects. Issues belong to projects. Documents belong to issues and projects.

  There's agent communication. Agents can directly communicate with other agents by name, communicate with the human, and they can communicate by purpose.

  OR they can communciate by purpose. So, an agent building a context pack, can leave a message for the spec creator, the context pack reviewer, the spec reviewer, the implementer or the tester.

  Issues have built in dependencies agents know which to run.

Issues have the description, and comments, so everyone can comment. 

  Part 2:

  A dashboard screen which shows what's running, what state it's in and what's coming next.

  A human will start each issue, but an orchestrator will manage the progress. Ie,

  Issue is in todo - There will be a panel on the issue that lets the user select which models handle what. This can be configured and saved to have different model variations:  Ie, context pack creation - opus 4.5
context pack review - gpt 5.2-high
.. all the way to

pr review - where we can select which models will be orchestrator, scout and judge

we also have the ability to add multiple scouts, so we could have multiple models as the same scout

When the human selects this, then hits start the process starts

The program should handle all the management of tasks, so we aren't bogging down models with this.

Things should be kept really simple for the models and they'll just be given toolset instructions with actions they can take:

They'll be told they're working on an issue, and they have a specific task to do, and be told the other stages so they have full context.

They'll be told they can comment on their issue, or send a message to whoever will handle the future stages if there's something that they need to know.

They'll also receive any messages, that were left for them from other agents.

in fact, scrap the agents messaging agents. This isn't needed. Agents should just leave messages for the task types. Ie, "message for spec review agent", and whichever agent gets it then, reads it.  That way we don't have agent communication, but we have stage communication.

falcon-ai will be managing the state, and waiting for each agent to finish. 

The agents will be given a simple tool to communicate via api with falcon.

They will be given an issue id, and this is how they communicate, so they can say "leave comment on issue id", "write message for implementor on issue id". Via the api and the tool of course.



---

How agents are called
-----------------------

Read the ai_docs about calling claude in non-interactive mode. 

We should have 2 modes, a debug mode, where on the ux the user can watch the output(in a debug tab), or a normal mode, where you disable output, and instead let the agents communicate via the api.

For doing this with codex, search the web for how to do it to learn.

when falcon receives a work complete signal from the agent, it should then update the issue, change state etc and call the next agent

Oh, and falcon can use haiku, sonnet and opus via claude code for orchestrator intelligence. 

so for example, when each issue is created, it can ask haiku for a git branch name, then falcon creates it and attaches it to the issue.

context/specs should be created in .falcon/issues/id/specs and .falcon/issues/id/context

and ai_docs in .falcon/issues/id/ai_docs, but .falcon/ai_docs/INDEX.md will be an index kept with ALL ai_docs so the context pack creator can also look for relevant existing ai_docs as well as docs/

Just now, disable injection of the self-learning system. We will add this later when the base system works. 



How issues are added
------------------------

The falcon skill tool will be made similar to how the linear.py tool lets agents add things on linear.

the PM role will be responsible for adding tasks, and a manual agent monitored by the human will create an md for the PM. Falcon only starts at the todo/create context phase. The docs/ building phase is all done manually in claude code direclty, so we don't need to build this functionality into falcon


More about the system
-------------------------


Once agents start work on an issue, they will keep going through the workflow. THey won't need human attention during the context/spec/implementation stages.

Don't tell them they can raise a flag for a human here. We don't want or need that.

Actually. We should pre-configure agents within falcon-ai

We will have a screen that lets us add them. 

So if we add let's say opus-1, then falcon-ai will create ~/.falcon/projects/project_name/agents/agent_folders

The user will be able to add his project directory when adding a new project via the ux

They might choose ~/Projects/some-project

Let's say the user adds opus-1 and codex-1

folders for them will be setup in ~/.falcon/projects/some-project/agents/codex-1 and claude-1

A git repo setup in each. 

Large files will be managed in ~/.falcon/projects/some-project/primary and sym-linked (is this ok to do?)

large files won't be included in the git repo.

falcon will setup a remote repo

in the setup the github account will be able to be added and stored, as will multiple claude code max and codex pro subscriptions. API keys for llms will never be used.

falcon-ai will handle the repos

When an issue starts, falcon will choose an available agent based on what the user has added. Ie, if the user wants "haiku-4.5" then it'll choose the next available claude. If the user wants codex-5.2-xhigh, it'll choose the next available codex

They're be a screen showing what agents are in use. When an agent is working on an issue they can't be re-assigned, because we'll keep that agents folder in the right issue branch.

falcon can add more agents if needed. If it needs another opus, it can add the next claude, setup the folder, pull main etc

falcon should keep all folders in sync, so after a merge with main, ALL folders with agents not actively working should be pulled from main

falcon will move the issues through the stages until it reaches the PR review stage, where it will create a PR review on github, then launch all the scouts/judges/orchestrator. the orchestrator will be given the PR, and he will update the PR by commenting with full details of all faults.

This is the stage flagged for human review.

Only a human can launch a fixer.

The human, via the falcon PR dashboard screen will be able to review ALL issues found. It'll display ones approved, and ones dismissed. The human  can dismiss approved ones with a comment, and approve dismissed ones with a comment before launching the fixer.

Once the human launches the fixer and it's done, falcon will call the PR_REVIEW, but this time to re-review, so not calling scouts again, but to check the fixes. If approved. It's moved into the next stage, which depending on what the user's selected for this issue(there will be groups the user can pre-create, so we can have a "full-no-test", which might be everything except test. The user will be able to configure these and select them for each issue, and set defaults for projects and defaults for labels. Ie, doc issues will have very different workflows than fundamentals

After the testing stage, we are inserting a "doc review" stage. We need to create a new prompt for this, but it will essentially be looking through the code to see what changed, and based on that, do we need to udpate anything in the docs/ ?

It can be system, support or design. The goal is to keep the docs updated and a source of truth.

Once that stage is done, it's ready to merge, and then if there's any merge conflicts, it's flagged for a human(who will then open up claude code directly, resolve and come back to falcon and mark it as merged)

If there's no merge conflicts, then falcon can merge it, update all the agent folders that aren't on an active job, and pull from main.

Remembering, once all active agents finish on an issue, they should pull main and be ready on the latest main. It's important to make sure ALL agents have always pulled from main before starting an issue and going into a branch.

