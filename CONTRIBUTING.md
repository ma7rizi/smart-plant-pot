# How the team works on this project

All work is tracked in **[Issues](../../issues)** and on the **project board**. One issue = one task.

## 1. Pick a task

- Open **Issues** and choose one, or take the one assigned to you.
- On the right, under **Assignees**, click **assign yourself**. Now everyone knows you're on it.
- On the project board, move the card from **To do** to **In progress**.

## 2. Get the code (first time only)

```bash
git clone https://github.com/ma7rizi/smart-plant-pot.git
cd smart-plant-pot
pip install -r requirements.txt
python app.py
```

## 3. Work on your own branch

Never work straight on `main`. Make a branch named after the issue:

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
- its card moves to **Done** on the board.

## Rules

- Pull before you start: `git pull`.
- Never upload passwords or keys. Wi-Fi details go in `firmware/smart_pot/secrets.h`, which Git ignores.
- Don't commit `plant.db`.
- Found a bug? Open a new issue with the `bug` label.
