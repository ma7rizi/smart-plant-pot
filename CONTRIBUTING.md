# How the team works on this project

All work is tracked in **[Issues](../../issues)** and on the **project board**. One issue = one task.

## 1. Pick a task

- Open **Issues** and choose one, or take the one assigned to you.
- On the right, under **Assignees**, click **assign yourself**. Now everyone knows you're on it.
- On the project board, move the card from **Todo** to **In Progress**.

## 2. Get the code (first time only)

```bash
git clone https://github.com/ma7rizi/smart-plant-pot.git
cd smart-plant-pot
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 and sign in with **`admin`** / **`admin123`** (works on your own computer only).

## 3. Work on your own branch

`main` is protected: nobody can push to it directly, force-push it or delete it. All work goes through a branch and a pull request.

Make a branch named after the issue. The easiest way is the issue's sidebar: **Development**, then **Create a branch**. That links it to the issue. Or from the terminal:

```bash
git checkout main
git pull
git checkout -b 3-login
```

Make your changes, then save them:

```bash
git add .
git commit -m "Add sign-up and login pages (#3)"
git push -u origin 3-login
```

Writing `#3` in the message links the commit to issue 3.

## 4. Tick the checklist

Open your issue and tick each step in the checklist as you finish it. Anyone in the team can tick boxes, and the issue shows the progress (for example "3 of 6 tasks").

## 5. Open a pull request

- On GitHub, click **Compare & pull request** for your branch.
- In the description write **`Closes #3`** (use your issue number).
- Ask a teammate to review it.

## 6. Merge = done

When the pull request is approved and merged into `main`:

- the issue **closes automatically** (because of `Closes #3`), and
- its card moves to **Done** on the board, and
- the branch is **deleted automatically**. Run `git checkout main && git pull` to start the next task.

## Rules

- Pull before you start: `git pull`.
- Never upload passwords or keys. Wi-Fi details go in `firmware/smart_pot/secrets.h`, which Git ignores.
- Don't commit `plant.db`.
- Found a bug? Open a new issue with the `bug` label.
- Don't put people's names in the repository; it's public. Use roles instead (see the README).
- After a merge, the live site updates only when someone runs `git pull` on PythonAnywhere and clicks **Reload** (see [DEPLOY.md](DEPLOY.md)).
