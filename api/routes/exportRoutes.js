const express = require("express");
const XLSX = require("xlsx");
const { pool } = require("../db");
const { SUPERTEAM_LEAGUE, ROUND_LEAGUES } = require("../constants");
const { loadRoundRules } = require("../rulesEngine");
const { leaderboard } = require("../helpers/scoreQueries");
const { superTeamLeaderboard, formatSuperTeamName, loadSuperTeamMembers } = require("../helpers/superTeamQueries");

const router = express.Router();

function formatItemValue(item, raw) {
  if (raw == null) return "";
  if (item.type === "binary") return raw ? "✔" : "";
  if (item.type === "multi") return Array.isArray(raw) ? raw.join("، ") : "";
  if (item.type === "choice") {
    const found = (item.choices || []).find((c) => c.value === raw);
    return found ? found.label : "";
  }
  if (item.type === "scale" || item.type === "counter") return raw;
  return "";
}

// Excel sheet names: max 31 chars, no []:*?/\\, must be unique within the workbook.
function sheetName(base, used) {
  let name =
    String(base)
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 31) || "Sheet";
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = `-${n}`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

async function buildRoundSheet(round, usedNames) {
  const { sections } = await loadRoundRules(round.id);
  const flatItems = sections.flatMap((sec) =>
    sec.items.map((item) => ({
      ...item,
      sectionKey: sec.key,
      sectionLabel: sec.label,
    })),
  );

  const isSuper = !!round.is_superteam || round.league === SUPERTEAM_LEAGUE;
  const { rows: scoreRows } = await pool.query(
    isSuper
      ? `SELECT s.*
         FROM score_entries s
         WHERE s.round_id = $1 AND s.super_team_id IS NOT NULL
         ORDER BY s.super_team_id, s.created_at`
      : `SELECT s.*, t.name AS team_name
         FROM score_entries s JOIN teams t ON t.id = s.team_id
         WHERE s.round_id = $1
         ORDER BY t.name, s.created_at`,
    [round.id],
  );

  let membersById = new Map();
  if (isSuper) {
    const ids = [...new Set(scoreRows.map((s) => s.super_team_id).filter(Boolean))];
    membersById = await loadSuperTeamMembers(ids);
  }

  const sheetRows = scoreRows.map((s, idx) => {
    const values = JSON.parse(s.values_json);
    const sectionTotals = JSON.parse(s.section_totals_json);
    const displayName = isSuper
      ? formatSuperTeamName(membersById.get(s.super_team_id) || [])
      : s.team_name;
    const row = {
      [isSuper ? "سوپرتیم" : "تیم"]: displayName,
    };
    if (round.allows_multiple_tries) {
      const key = isSuper ? "super_team_id" : "team_id";
      const tryCount = scoreRows
        .slice(0, idx + 1)
        .filter((x) => x[key] === s[key]).length;
      row["شماره تلاش"] = tryCount;
    }
    row["زمان راند (ثانیه)"] = s.round_time_seconds;
    row["داور"] = s.judge_name || "";
    for (const item of flatItems) {
      const raw = values?.[item.sectionKey]?.[item.key];
      row[`${item.sectionLabel} – ${item.label}`] = formatItemValue(item, raw);
    }
    for (const sec of sections) {
      row[`جمع ${sec.label}`] = sectionTotals[sec.key] ?? "";
    }
    row["امتیاز نهایی"] = s.final_total;
    row["کاپیتان"] = s.captain_name || "";
    row["تاریخ ثبت"] =
      s.created_at instanceof Date
        ? s.created_at.toLocaleString("fa-IR")
        : s.created_at;
    return row;
  });

  const label = round.label || `راند ${round.round_number}`;
  const name = sheetName(`${label}`, usedNames);
  return { name, sheet: XLSX.utils.json_to_sheet(sheetRows) };
}

router.get("/", async (req, res) => {
  const { league } = req.query;
  const leaguesToExport = league
    ? [league]
    : ROUND_LEAGUES;

  try {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set();

    for (const lg of leaguesToExport) {
      const { rows: rounds } = await pool.query(
        "SELECT * FROM rounds WHERE league = $1 ORDER BY sort_order, round_number",
        [lg],
      );
      for (const round of rounds) {
        const { name, sheet } = await buildRoundSheet(round, usedNames);
        XLSX.utils.book_append_sheet(wb, sheet, name);
      }

      if (lg === SUPERTEAM_LEAGUE) {
        const lbRows = await superTeamLeaderboard();
        const lbSheetRows = lbRows.map((r) => ({
          سوپرتیم: r.super_team_name,
          "تیم‌های عضو": (r.members || []).map((m) => `${m.team_name} (${m.league})`).join(" + "),
          امتیاز: r.played ? r.raw_score : "",
          "زمان (ثانیه)": r.played ? r.round_time_seconds : "",
        }));
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(lbSheetRows),
          sheetName("رده‌بندی سوپرتیم", usedNames),
        );
      } else {
        const lbRows = await leaderboard({ league: lg });
        const lbSheetRows = lbRows.map((r) => {
          const row = { تیم: r.team_name };
          for (const rd of r.rounds) {
            const label = rd.round_label || `راند ${rd.round_number}`;
            row[`${label} – نرمال`] = rd.played ? rd.normalized_score : "";
            row[`${label} – خام`] = rd.played ? rd.raw_score : "";
            row[`${label} – زمان (ثانیه)`] = rd.played ? rd.round_time_seconds : "";
          }
          row["مجموع امتیاز نرمال‌شده"] = r.total_normalized;
          row["تعداد راندهای انجام‌شده"] = `${r.rounds_played} از ${r.total_rounds}`;
          return row;
        });
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(lbSheetRows),
          sheetName(`رده‌بندی ${lg}`, usedNames),
        );
      }
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = league
      ? `IranOpen-InSitu-${league}-scores.xlsx`
      : "IranOpen-InSitu-all-leagues-scores.xlsx";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (err) {
    console.error("Export failed:", err);
    res.status(500).json({ error: "خطا در ساخت فایل خروجی" });
  }
});

module.exports = router;
