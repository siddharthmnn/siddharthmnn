import fs from "node:fs/promises";

const USERNAME = "siddharthmnn";
const TOKEN = process.env.PROFILE_TOKEN;

if (!TOKEN) {
  throw new Error(
    "Missing PROFILE_TOKEN. Add a GitHub classic personal access token with read:user scope as a repository Actions secret."
  );
}

const headers = {
  Authorization: "Bearer " + TOKEN,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "siddharthmnn-profile-stats"
};

async function githubRest(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("GitHub REST request failed (" + response.status + "): " + await response.text());
  }
  return response.json();
}

async function githubGraphQL(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error("GitHub GraphQL request failed: " + JSON.stringify(payload.errors ?? payload));
  }
  return payload.data;
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]);
}

function calculateStreaks(days) {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let run = 0;

  for (const day of ordered) {
    if (day.contributionCount > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let index = ordered.length - 1;

  // If today has no recorded contribution yet, allow yesterday to be
  // the end of the current streak.
  if (index >= 0 && ordered[index].date === new Date().toISOString().slice(0, 10)
      && ordered[index].contributionCount === 0) {
    index -= 1;
  }

  let current = 0;
  while (index >= 0 && ordered[index].contributionCount > 0) {
    current += 1;
    index -= 1;
  }

  return { current, longest };
}

function createStatsSvg(data) {
  const metrics = [
    ["PUBLIC REPOSITORIES", data.repositories],
    ["STARS EARNED", data.stars],
    ["FOLLOWERS", data.followers],
    ["CONTRIBUTIONS · 12 MONTHS", data.contributions]
  ];

  const cards = metrics.map((metric, index) => {
    const x = 32 + index * 236;
    return [
      '<g transform="translate(' + x + ' 0)">',
      '<rect x="0" y="96" width="220" height="88" rx="12" fill="#25143A" stroke="#5B2A86"/>',
      '<text x="110" y="126" fill="#C4B5FD" font-family="Arial,sans-serif" font-size="11" text-anchor="middle" letter-spacing=".5">' + xml(metric[0]) + '</text>',
      '<text x="110" y="163" fill="#F5F0FF" font-family="Arial,sans-serif" font-size="29" font-weight="700" text-anchor="middle">' + xml(metric[1]) + '</text>',
      '</g>'
    ].join("");
  }).join("");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="250" viewBox="0 0 1000 250" role="img" aria-labelledby="title desc">',
    '<title id="title">GitHub statistics for ' + USERNAME + '</title>',
    '<desc id="desc">Public repositories, stars, followers, contributions and contribution streaks.</desc>',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10091D"/><stop offset="1" stop-color="#1D1030"/></linearGradient>',
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#C084FC"/></linearGradient>',
    '</defs>',
    '<rect width="1000" height="250" rx="18" fill="url(#bg)"/>',
    '<rect x="1" y="1" width="998" height="248" rx="17" fill="none" stroke="#6D28D9" stroke-opacity=".6"/>',
    '<rect x="32" y="30" width="5" height="28" rx="2.5" fill="url(#accent)"/>',
    '<text x="52" y="50" fill="#E9D5FF" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="1">GITHUB STATS</text>',
    '<text x="968" y="49" fill="#A78BFA" font-family="Arial,sans-serif" font-size="13" text-anchor="end">@' + USERNAME + '</text>',
    '<line x1="32" y1="75" x2="968" y2="75" stroke="#6D28D9" stroke-opacity=".45"/>',
    cards,
    '<text x="34" y="221" fill="#C4B5FD" font-family="Arial,sans-serif" font-size="12">CURRENT STREAK: ' + data.currentStreak + ' DAYS</text>',
    '<text x="968" y="221" fill="#C4B5FD" font-family="Arial,sans-serif" font-size="12" text-anchor="end">LONGEST STREAK · LAST 12 MONTHS: ' + data.longestStreak + ' DAYS</text>',
    '</svg>'
  ].join("");
}

function createContributionSvg(weeks, total) {
  const cell = 11;
  const gap = 4;
  const startX = 42;
  const startY = 77;
  const colors = ["#21132F", "#48206D", "#6D28A8", "#9333EA", "#C084FC"];
  const cells = [];
  const monthLabels = [];
  let lastMonth = "";

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      const count = day.contributionCount;
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
      const x = startX + weekIndex * (cell + gap);
      const y = startY + dayIndex * (cell + gap);

      cells.push(
        '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="2" fill="' + colors[level] + '">' +
        '<title>' + xml(day.date) + ': ' + count + ' contributions</title></rect>'
      );

      const month = day.date.slice(0, 7);
      if (month !== lastMonth && dayIndex <= 6) {
        const label = new Date(day.date + "T00:00:00Z").toLocaleString("en", {
          month: "short",
          timeZone: "UTC"
        });
        monthLabels.push(
          '<text x="' + x + '" y="65" fill="#B9A7CD" font-family="Arial,sans-serif" font-size="10">' + xml(label) + '</text>'
        );
        lastMonth = month;
      }
    });
  });

  const width = 1000;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="205" viewBox="0 0 ' + width + ' 205" role="img" aria-labelledby="title desc">',
    '<title id="title">GitHub contribution history for ' + USERNAME + '</title>',
    '<desc id="desc">' + total + ' contributions over the last 12 months, displayed as a contribution calendar.</desc>',
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10091D"/><stop offset="1" stop-color="#1D1030"/></linearGradient></defs>',
    '<rect width="' + width + '" height="205" rx="18" fill="url(#bg)"/>',
    '<rect x="1" y="1" width="' + (width - 2) + '" height="203" rx="17" fill="none" stroke="#6D28D9" stroke-opacity=".55"/>',
    '<rect x="32" y="23" width="5" height="25" rx="2.5" fill="#A855F7"/>',
    '<text x="52" y="42" fill="#E9D5FF" font-family="Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="1">CONTRIBUTION ACTIVITY</text>',
    '<text x="' + (width - 32) + '" y="41" fill="#A78BFA" font-family="Arial,sans-serif" font-size="12" text-anchor="end">@' + USERNAME + '</text>',
    monthLabels.join(""),
    cells.join(""),
    '<text x="42" y="190" fill="#C4B5FD" font-family="Arial,sans-serif" font-size="11">' + Number(total).toLocaleString("en-US") + ' contributions in the last 12 months</text>',
    '</svg>'
  ].join("");
}

async function main() {
  const profile = await githubRest("https://api.github.com/users/" + USERNAME);

  let stars = 0;
  for (let page = 1; ; page += 1) {
    const repositories = await githubRest(
      "https://api.github.com/users/" + USERNAME + "/repos?type=owner&per_page=100&page=" + page
    );
    for (const repository of repositories) {
      stars += repository.stargazers_count ?? 0;
    }
    if (repositories.length < 100) break;
  }

  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const query = [
    "query($login: String!, $from: DateTime!, $to: DateTime!) {",
    "  user(login: $login) {",
    "    contributionsCollection(from: $from, to: $to) {",
    "      contributionCalendar {",
    "        totalContributions",
    "        weeks { contributionDays { date contributionCount } }",
    "      }",
    "    }",
    "  }",
    "}"
  ].join("\n");

  const result = await githubGraphQL(query, {
    login: USERNAME,
    from: from.toISOString(),
    to: now.toISOString()
  });

  const calendar = result.user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap((week) => week.contributionDays);
  const streak = calculateStreaks(days);

  await fs.mkdir("assets", { recursive: true });
  await fs.writeFile("assets/github-stats.svg", createStatsSvg({
    repositories: profile.public_repos,
    stars,
    followers: profile.followers,
    contributions: calendar.totalContributions,
    currentStreak: streak.current,
    longestStreak: streak.longest
  }), "utf8");

  await fs.writeFile(
    "assets/contribution-graph.svg",
    createContributionSvg(calendar.weeks, calendar.totalContributions),
    "utf8"
  );

  console.log("Updated profile statistics successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
