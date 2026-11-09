use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDescriptor {
    pub id: String,
    pub name: String,
    pub plugin_id: Option<String>,
    pub description: String,
    pub triggers: Vec<String>,
    pub source_path: String,
    pub source_kind: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMatch {
    pub skill: SkillDescriptor,
    pub score: f32,
    pub confidence: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRerankResult {
    pub candidates: Vec<SkillMatch>,
    pub used_model_rerank: bool,
    pub fallback: bool,
    pub warning: Option<String>,
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches(['"', '\'']).trim().to_string()
}

fn parse_frontmatter(path: &Path) -> Option<(String, String, Vec<String>)> {
    let text = fs::read_to_string(path).ok()?;
    if !text.starts_with("---") {
        return None;
    }
    let end = text[3..].find("\n---")? + 3;
    let block = &text[3..end];
    let mut name = String::new();
    let mut description = String::new();
    let mut triggers = Vec::new();
    let mut trigger_mode = false;
    for raw_line in block.lines() {
        let line = raw_line.trim();
        if let Some(value) = line.strip_prefix("name:") {
            name = unquote(value);
            trigger_mode = false;
        } else if let Some(value) = line.strip_prefix("description:") {
            description = unquote(value);
            trigger_mode = false;
        } else if let Some(value) = line.strip_prefix("triggers:") {
            trigger_mode = true;
            let value = unquote(value);
            if !value.is_empty() && value != "[]" {
                triggers.extend(
                    value
                        .trim_matches(['[', ']'])
                        .split(',')
                        .map(unquote)
                        .filter(|value| !value.is_empty()),
                );
            }
        } else if trigger_mode && line.starts_with('-') {
            let value = unquote(line.trim_start_matches('-'));
            if !value.is_empty() {
                triggers.push(value);
            }
        } else if !line.starts_with(' ') && !line.starts_with('\t') {
            trigger_mode = false;
        }
    }
    if name.is_empty() {
        name = path.parent()?.file_name()?.to_string_lossy().to_string();
    }
    Some((name, description, triggers))
}

fn enabled_plugins(config_path: &Path) -> (HashSet<String>, Vec<String>) {
    let Ok(text) = fs::read_to_string(config_path) else {
        return (HashSet::new(), Vec::new());
    };
    let mut enabled = HashSet::new();
    let mut warnings = Vec::new();
    let mut current: Option<String> = None;
    let mut current_enabled = true;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            if let Some(id) = current.take() {
                if current_enabled {
                    enabled.insert(id);
                }
            }
            current_enabled = true;
            if let Some(rest) = line.strip_prefix("[plugins.\"") {
                if let Some(id) = rest.strip_suffix("\"]") {
                    current = Some(id.to_string());
                }
            }
        } else if let Some(value) = line.strip_prefix("enabled") {
            if let Some(value) = value.trim().strip_prefix('=') {
                current_enabled = value.trim().eq_ignore_ascii_case("true");
            }
        }
    }
    if let Some(id) = current {
        if current_enabled {
            enabled.insert(id);
        }
    }
    if enabled.is_empty() {
        warnings.push(
            "未从 config.toml 读取到已启用插件，插件 skills 将不会自动加入候选。".to_string(),
        );
    }
    (enabled, warnings)
}

fn version_key(value: &str) -> Vec<u64> {
    value
        .split(['.', '-', '_'])
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn best_version_dir(path: &Path) -> Option<PathBuf> {
    let mut versions = fs::read_dir(path)
        .ok()?
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    versions.sort_by_key(|path| {
        path.file_name()
            .and_then(|value| value.to_str())
            .map(version_key)
            .unwrap_or_default()
    });
    versions.pop()
}

fn collect_skill_file(
    path: &Path,
    id: String,
    plugin_id: Option<String>,
    source_kind: &str,
    version: Option<String>,
    skills: &mut Vec<SkillDescriptor>,
) {
    let Some((name, description, triggers)) = parse_frontmatter(path) else {
        return;
    };
    skills.push(SkillDescriptor {
        id,
        name,
        plugin_id,
        description,
        triggers,
        source_path: path.to_string_lossy().to_string(),
        source_kind: source_kind.to_string(),
        version,
    });
}

fn scan_skill_root(root: &Path, source_kind: &str, skills: &mut Vec<SkillDescriptor>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if !skill_file.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("skill");
        collect_skill_file(
            &skill_file,
            format!("{source_kind}:{name}"),
            None,
            source_kind,
            None,
            skills,
        );
    }
}

pub fn discover_skills(
    codex_home: &Path,
    project_roots: &[String],
) -> (Vec<SkillDescriptor>, Vec<String>) {
    let mut skills = Vec::new();
    let mut warnings = Vec::new();
    scan_skill_root(&codex_home.join("skills"), "local", &mut skills);
    let system_root = codex_home.join("skills").join(".system");
    scan_skill_root(&system_root, "system", &mut skills);

    let (enabled, config_warnings) = enabled_plugins(&codex_home.join("config.toml"));
    warnings.extend(config_warnings);
    for plugin_id in enabled {
        let Some((plugin_name, marketplace)) = plugin_id.split_once('@') else {
            warnings.push(format!("插件标识格式无法识别：{plugin_id}"));
            continue;
        };
        let plugin_root = codex_home
            .join("plugins")
            .join("cache")
            .join(marketplace)
            .join(plugin_name);
        let Some(version_root) = best_version_dir(&plugin_root) else {
            warnings.push(format!("已启用插件 {plugin_id} 的缓存目录不存在。"));
            continue;
        };
        let version = version_root
            .file_name()
            .and_then(|value| value.to_str())
            .map(str::to_string);
        let skill_root = version_root.join("skills");
        let Ok(entries) = fs::read_dir(&skill_root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path().join("SKILL.md");
            if !path.is_file() {
                continue;
            }
            let skill_name = entry.file_name().to_string_lossy().to_string();
            collect_skill_file(
                &path,
                format!("{plugin_id}::{skill_name}"),
                Some(plugin_id.clone()),
                "plugin",
                version.clone(),
                &mut skills,
            );
        }
    }

    for root in project_roots {
        scan_skill_root(
            &PathBuf::from(root).join(".agents").join("skills"),
            "project",
            &mut skills,
        );
    }

    let mut deduped = HashMap::<String, SkillDescriptor>::new();
    for skill in skills {
        let key = format!(
            "{}::{}",
            skill.id,
            skill.version.clone().unwrap_or_default()
        );
        deduped.insert(key, skill);
    }
    let mut result = deduped.into_values().collect::<Vec<_>>();
    result.sort_by(|left, right| left.id.cmp(&right.id));
    (result, warnings)
}

fn text_tokens(value: &str) -> HashSet<String> {
    let lower = value.to_lowercase();
    let mut tokens = HashSet::new();
    for token in lower
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| token.chars().count() >= 2)
    {
        tokens.insert(token.to_string());
        if token.chars().all(|ch| ch.is_ascii_alphabetic()) && token.len() >= 4 {
            for size in 3..=5 {
                for window in token.as_bytes().windows(size) {
                    if let Ok(value) = std::str::from_utf8(window) {
                        tokens.insert(value.to_string());
                    }
                }
            }
        }
    }
    for chars in lower.chars().collect::<Vec<_>>().windows(2) {
        tokens.insert(chars.iter().collect());
    }
    tokens
}

pub fn local_candidates(
    task: &str,
    skills: &[SkillDescriptor],
    disabled_plugin_ids: &[String],
    limit: usize,
) -> Vec<SkillMatch> {
    let task_lower = task.to_lowercase();
    let task_tokens = text_tokens(task);
    let mut matches = Vec::new();
    for skill in skills {
        if skill
            .plugin_id
            .as_ref()
            .is_some_and(|id| disabled_plugin_ids.iter().any(|disabled| disabled == id))
        {
            continue;
        }
        let mut score = 0.0_f32;
        let mut reasons = Vec::new();
        if task_lower.contains(&skill.name.to_lowercase()) {
            score += 5.0;
            reasons.push(format!("任务显式包含 skill 名称 `{}`", skill.name));
        }
        for trigger in &skill.triggers {
            if task_lower.contains(&trigger.to_lowercase()) {
                score += 3.0;
                reasons.push(format!("命中触发词 `{trigger}`"));
            }
        }
        let description_tokens = text_tokens(&format!("{} {}", skill.name, skill.description));
        let overlap = task_tokens.intersection(&description_tokens).count();
        if overlap > 0 {
            score += (overlap.min(5) as f32) * 0.7;
            reasons.push(format!("描述关键词重合 {overlap} 项"));
        }
        if score > 0.0 {
            let confidence_value = (score / 7.0).clamp(0.0, 1.0);
            matches.push(SkillMatch {
                skill: skill.clone(),
                score,
                confidence: if confidence_value >= 0.72 {
                    "high".to_string()
                } else if confidence_value >= 0.42 {
                    "medium".to_string()
                } else {
                    "low".to_string()
                },
                reason: reasons.join("；"),
            });
        }
    }
    matches.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.skill.id.cmp(&right.skill.id))
    });
    matches.truncate(limit.clamp(5, 8));
    matches
}

pub fn rerank_prompt(task: &str, candidates: &[SkillMatch]) -> String {
    let catalog = candidates
        .iter()
        .map(|candidate| {
            format!(
                "- id: {}\n  name: {}\n  description: {}",
                candidate.skill.id, candidate.skill.name, candidate.skill.description
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "Select only skills that materially help the task. Return JSON only in the form \
         {{\"ids\":[\"exact id\"]}}. Choose zero to five items.\n\nTask:\n{task}\n\nCandidates:\n{catalog}"
    )
}

pub fn parse_rerank_ids(raw: &str, candidates: &[SkillMatch]) -> Result<Vec<SkillMatch>, String> {
    let value: serde_json::Value = serde_json::from_str(raw.trim())
        .map_err(|_| "PF-CX-013 模型重排返回的 JSON 无法解析。".to_string())?;
    let ids = value
        .get("ids")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "PF-CX-013 模型重排结果缺少 ids。".to_string())?;
    let allowed = candidates
        .iter()
        .map(|candidate| (candidate.skill.id.as_str(), candidate))
        .collect::<HashMap<_, _>>();
    let mut selected: Vec<SkillMatch> = Vec::new();
    for id in ids.iter().filter_map(serde_json::Value::as_str).take(5) {
        if let Some(candidate) = allowed.get(id) {
            if !selected.iter().any(|existing| existing.skill.id == id) {
                selected.push((*candidate).clone());
            }
        }
    }
    Ok(selected)
}

pub fn fallback_result(
    candidates: Vec<SkillMatch>,
    warning: impl Into<String>,
) -> SkillRerankResult {
    SkillRerankResult {
        candidates,
        used_model_rerank: false,
        fallback: true,
        warning: Some(warning.into()),
    }
}

pub fn skill_instruction_lines(matches: &[SkillMatch]) -> Vec<String> {
    matches
        .iter()
        .map(|matched| {
            let plugin = matched
                .skill
                .plugin_id
                .as_deref()
                .map(|id| format!("，所属插件 `{id}`"))
                .unwrap_or_default();
            format!(
                "- 使用 Codex skill `{}`{}。执行前先读取并遵循该 skill 的 `SKILL.md`。",
                matched.skill.name, plugin
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(id: &str, name: &str, description: &str, triggers: &[&str]) -> SkillDescriptor {
        SkillDescriptor {
            id: id.to_string(),
            name: name.to_string(),
            plugin_id: None,
            description: description.to_string(),
            triggers: triggers.iter().map(|value| value.to_string()).collect(),
            source_path: format!("{id}/SKILL.md"),
            source_kind: "local".to_string(),
            version: None,
        }
    }

    #[test]
    fn explicit_skill_name_ranks_first() {
        let skills = vec![
            skill("pdf-helper", "pdf-helper", "Extract PDF pages", &["pdf"]),
            skill(
                "docx-helper",
                "docx-helper",
                "Create Word documents",
                &["docx"],
            ),
        ];
        let matches = local_candidates("请使用 pdf-helper 提取 PDF", &skills, &[], 5);
        assert_eq!(matches[0].skill.id, "pdf-helper");
    }

    #[test]
    fn malformed_rerank_result_returns_explicit_error_for_fallback() {
        let candidates = local_candidates(
            "生成 Word 文档",
            &[skill(
                "documents",
                "documents",
                "Create DOCX files",
                &["word"],
            )],
            &[],
            5,
        );
        assert!(parse_rerank_ids("not-json", &candidates).is_err());
        let fallback = fallback_result(candidates, "模型重排失败，已回退本地评分。");
        assert!(fallback.fallback);
        assert!(!fallback.used_model_rerank);
    }

    #[test]
    fn disabled_plugin_skills_are_excluded() {
        let mut candidate = skill("plugin::pdf", "pdf", "PDF helper", &["pdf"]);
        candidate.plugin_id = Some("pdf@market".to_string());
        let matches = local_candidates("处理 pdf", &[candidate], &["pdf@market".to_string()], 5);
        assert!(matches.is_empty());
    }
}
