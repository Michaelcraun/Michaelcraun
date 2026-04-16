const fs = require("fs");

const username = process.env.GH_USERNAME;
const token = process.env.GH_TOKEN;
const fallbackToken = process.env.GH_FALLBACK_TOKEN;

if (!username) throw new Error("GH_USERNAME is required");
if (!token && !fallbackToken) {
  throw new Error(
    "An authentication token is required. Set GH_TOKEN or GH_FALLBACK_TOKEN."
  );
}

const readmePath = "README.md";
const startMarker = "<!--START_SECTION:annual_stats-->";
const endMarker = "<!--END_SECTION:annual_stats-->";

const now = new Date();
const year = now.getUTCFullYear();
const from = `${year}-01-01T00:00:00Z`;
const to = `${year}-12-31T23:59:59Z`;

const query = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
      }
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      commitContributionsByRepository(maxRepositories: 5) {
        repository {
          nameWithOwner
        }
        contributions(first: 1) {
          totalCount
        }
      }
    }
  }
}
`;

async function fetchStatsWithToken(authToken) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "User-Agent": `${username}-profile-readme-updater`
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from,
        to
      }
    })
  });

  if (!res.ok) {
    throw new Error(`GraphQL error: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL returned errors: ${JSON.stringify(body.errors)}`);
  }

  return body.data.user.contributionsCollection;
}

async function fetchStats() {
  if (token) {
    try {
      return await fetchStatsWithToken(token);
    } catch (error) {
      const isUnauthorized =
        error instanceof Error && error.message.includes("GraphQL error: 401");

      if (!isUnauthorized || !fallbackToken || fallbackToken === token) {
        throw error;
      }

      console.warn("GH_TOKEN was rejected for stats. Retrying with fallback token.");
    }
  }

  return fetchStatsWithToken(fallbackToken);
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
  const stats = await fetchStats();

  const topRepos =
    stats.commitContributionsByRepository
      ?.filter(r => (r.contributions?.totalCount || 0) > 0)
      .map(r => `  - **${r.repository.nameWithOwner}**: ${r.contributions.totalCount} commits`)
      .join("\n") || "  - No commit data available";

  const content = [
    `- **${year} total contributions:** ${stats.contributionCalendar.totalContributions}`,
    `- **Commits:** ${stats.totalCommitContributions}`,
    `- **Pull requests:** ${stats.totalPullRequestContributions}`,
    `- **Issues:** ${stats.totalIssueContributions}`,
    `- **Reviews:** ${stats.totalPullRequestReviewContributions}`,
    `- **Top repositories by commit contributions:**`,
    topRepos
  ].join("\n");

  const readme = fs.readFileSync(readmePath, "utf8");
  const updated = updateSection(readme, content);
  fs.writeFileSync(readmePath, updated, "utf8");
})();
