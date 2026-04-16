const fs = require("fs");

const username = process.env.GH_USERNAME;
const token = process.env.GH_TOKEN;

if (!username) {
  throw new Error("GH_USERNAME is required");
}

const readmePath = "README.md";
const startMarker = "<!--START_SECTION:activity-->";
const endMarker = "<!--END_SECTION:activity-->";

function formatEvent(event) {
  const repo = event.repo?.name || "unknown repo";

  switch (event.type) {
    case "PushEvent": {
      const count = event.payload?.commits?.length || 0;
      if (count <= 1) return `- Made a commit on **${repo}**`;
      return `- Made ${count} commits on **${repo}**`;
    }

    case "PullRequestEvent": {
      const action = event.payload?.action;
      if (action === "opened") return `- Opened a PR on **${repo}**`;
      if (action === "closed" && event.payload?.pull_request?.merged) {
        return `- Merged a PR on **${repo}**`;
      }
      if (action === "reopened") return `- Reopened a PR on **${repo}**`;
      return null;
    }

    case "IssuesEvent": {
      const action = event.payload?.action;
      if (action === "opened") return `- Created an issue on **${repo}**`;
      if (action === "closed") return `- Closed an issue on **${repo}**`;
      if (action === "reopened") return `- Reopened an issue on **${repo}**`;
      return null;
    }

    case "IssueCommentEvent":
      return `- Commented on an issue in **${repo}**`;

    case "PullRequestReviewEvent":
      return `- Reviewed a PR in **${repo}**`;

    case "CreateEvent": {
      const refType = event.payload?.ref_type;
      if (refType === "repository") return `- Created the repository **${repo}**`;
      if (refType === "branch") return `- Created a branch in **${repo}**`;
      if (refType === "tag") return `- Created a tag in **${repo}**`;
      return null;
    }

    case "ReleaseEvent":
      return `- Published a release in **${repo}**`;

    default:
      return null;
  }
}

async function fetchEvents() {
  // Public endpoint works without elevated user scopes.
  // If you later want private activity, use a PAT in GH_TOKEN.
  const url = `https://api.github.com/users/${username}/events/public?per_page=100`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": `${username}-profile-readme-updater`
    }
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function updateSection(readme, content) {
  const pattern = new RegExp(
    `${startMarker}[\\s\\S]*?${endMarker}`,
    "m"
  );
  return readme.replace(
    pattern,
    `${startMarker}\n${content}\n${endMarker}`
  );
}

(async () => {
  const events = await fetchEvents();

  const lines = [];
  for (const event of events) {
    const line = formatEvent(event);
    if (line && !lines.includes(line)) {
      lines.push(line);
    }
    if (lines.length >= 10) break;
  }

  const content =
    lines.length > 0
      ? lines.join("\n")
      : "- No recent public activity found.";

  const readme = fs.readFileSync(readmePath, "utf8");
  const updated = updateSection(readme, content);
  fs.writeFileSync(readmePath, updated, "utf8");
})();