use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub const SKILL_BLOCK_START: &str = "<!-- PROMPT_FORGE_CODEX_SKILLS_START -->";
pub const SKILL_BLOCK_END: &str = "<!-- PROMPT_FORGE_CODEX_SKILLS_END -->";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReference {
    pub source_type: String,
    pub source_id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleFact {
    pub field: String,
    pub value: String,
    pub source: SourceReference,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextConflict {
    pub code: String,
    pub field: String,
    pub left_value: String,
    pub left_source: SourceReference,
    pub right_value: String,
    pub right_source: SourceReference,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleEvidence {
    pub roles: Vec<String>,
    pub domains: Vec<String>,
    pub tech_stacks: Vec<String>,
    pub constraints: Vec<String>,
    pub complete: bool,
    pub sources: Vec<SourceReference>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleEvidenceResult {
    pub evidence: RoleEvidence,
    pub conflicts: Vec<ContextConflict>,
}

fn normalize(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(['。', '.', '；', ';', ',', '，'])
        .to_string()
}

fn push_unique(values: &mut Vec<String>, value: &str, limit: usize) {
    let value = normalize(value);
    if value.is_empty() || values.iter().any(|existing| existing == &value) {
        return;
    }
    if values.len() < limit {
        values.push(value);
    }
}

fn contains_any(text: &str, terms: &[&str]) -> bool {
    let lower = text.to_lowercase();
    terms
        .iter()
        .any(|term| lower.contains(&term.to_lowercase()))
}

fn compact_excerpt(value: &str, limit: usize) -> String {
    let compact = normalize(value);
    if compact.chars().count() <= limit {
        compact
    } else {
        format!("{}…", compact.chars().take(limit).collect::<String>())
    }
}

pub fn infer_role_facts(text: &str, source: SourceReference) -> Vec<RoleFact> {
    const ROLE_TERMS: &[&str] = &[
        "工程师",
        "架构师",
        "设计师",
        "研究员",
        "产品经理",
        "学生",
        "教师",
        "咨询师",
        "作家",
        "developer",
        "engineer",
        "architect",
        "designer",
        "researcher",
    ];
    const DOMAIN_TERMS: &[&str] = &[
        "提示词工程",
        "软件工程",
        "数据科学",
        "学术写作",
        "市场营销",
        "生命科学",
        "基因组",
        "金融",
        "法律",
        "教育",
        "product design",
        "data science",
        "academic",
        "bioinformatics",
    ];
    const TECH_TERMS: &[&str] = &[
        "rust",
        "tauri",
        "react",
        "typescript",
        "javascript",
        "sqlite",
        "python",
        "node.js",
        "java",
        "go",
        "c++",
        "docker",
        "kubernetes",
        "webview",
        "postgresql",
    ];
    const CONSTRAINT_TERMS: &[&str] = &[
        "必须",
        "不得",
        "禁止",
        "只能",
        "约束",
        "must",
        "must not",
        "required",
        "constraint",
    ];

    let mut facts = Vec::new();
    for sentence in text.split(['\n', '。', '！', '!', '；', ';']) {
        let sentence = normalize(sentence);
        if sentence.is_empty() {
            continue;
        }
        let excerpt = compact_excerpt(&sentence, 240);
        if contains_any(&sentence, ROLE_TERMS) {
            facts.push(RoleFact {
                field: "role".to_string(),
                value: excerpt.clone(),
                source: source.clone(),
            });
        }
        if contains_any(&sentence, DOMAIN_TERMS) {
            facts.push(RoleFact {
                field: "domain".to_string(),
                value: excerpt.clone(),
                source: source.clone(),
            });
        }
        if contains_any(&sentence, TECH_TERMS) {
            facts.push(RoleFact {
                field: "tech_stack".to_string(),
                value: excerpt.clone(),
                source: source.clone(),
            });
        }
        if contains_any(&sentence, CONSTRAINT_TERMS) {
            facts.push(RoleFact {
                field: "constraint".to_string(),
                value: excerpt,
                source: source.clone(),
            });
        }
    }
    facts
}

pub fn build_role_evidence(facts: &[RoleFact]) -> RoleEvidenceResult {
    let mut result = RoleEvidenceResult::default();
    let mut fields: HashMap<String, Vec<&RoleFact>> = HashMap::new();
    for fact in facts {
        let value = normalize(&fact.value);
        if value.is_empty() {
            continue;
        }
        match fact.field.as_str() {
            "role" => push_unique(&mut result.evidence.roles, &value, 8),
            "domain" => push_unique(&mut result.evidence.domains, &value, 8),
            "tech_stack" => push_unique(&mut result.evidence.tech_stacks, &value, 12),
            "constraint" => push_unique(&mut result.evidence.constraints, &value, 16),
            _ => push_unique(&mut result.evidence.domains, &value, 8),
        }
        push_unique_source(&mut result.evidence.sources, &fact.source);
        fields.entry(fact.field.clone()).or_default().push(fact);
    }

    for (field, values) in fields {
        for (index, left) in values.iter().enumerate() {
            for right in values.iter().skip(index + 1) {
                let left_value = normalize(&left.value);
                let right_value = normalize(&right.value);
                if left_value == right_value
                    || left.source.source_id == right.source.source_id
                    || left_value.contains(&right_value)
                    || right_value.contains(&left_value)
                {
                    continue;
                }
                result.conflicts.push(ContextConflict {
                    code: "PF-CX-009".to_string(),
                    field: field.clone(),
                    left_value,
                    left_source: left.source.clone(),
                    right_value,
                    right_source: right.source.clone(),
                });
            }
        }
    }

    result.evidence.complete = !result.evidence.roles.is_empty()
        || !result.evidence.domains.is_empty()
        || !result.evidence.tech_stacks.is_empty();
    result
}

fn push_unique_source(values: &mut Vec<SourceReference>, source: &SourceReference) {
    if !values.iter().any(|existing| {
        existing.source_type == source.source_type && existing.source_id == source.source_id
    }) {
        values.push(source.clone());
    }
}

pub fn normalize_paragraph(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn paragraph_hash(value: &str) -> String {
    let normalized = normalize_paragraph(value);
    format!("{:x}", Sha256::digest(normalized.as_bytes()))
}

pub fn inject_skill_block(prompt: &str, skill_lines: &[String]) -> String {
    let prompt = remove_skill_block(prompt).trim_end().to_string();
    if skill_lines.is_empty() {
        return prompt;
    }
    format!(
        "{prompt}\n\n{SKILL_BLOCK_START}\n## Codex Skill Routing\n\n{}\n{SKILL_BLOCK_END}",
        skill_lines.join("\n")
    )
}

pub fn remove_skill_block(prompt: &str) -> String {
    let Some(start) = prompt.find(SKILL_BLOCK_START) else {
        return prompt.to_string();
    };
    let Some(relative_end) = prompt[start..].find(SKILL_BLOCK_END) else {
        return prompt.to_string();
    };
    let end = start + relative_end + SKILL_BLOCK_END.len();
    let mut result = String::with_capacity(prompt.len());
    result.push_str(prompt[..start].trim_end());
    result.push_str(prompt[end..].trim_start_matches(['\r', '\n', ' ']));
    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(id: &str) -> SourceReference {
        SourceReference {
            source_type: "codex_thread".to_string(),
            source_id: id.to_string(),
            label: format!("来源 {id}"),
        }
    }

    #[test]
    fn extracts_role_domain_and_tech_evidence() {
        let facts = infer_role_facts(
            "我是资深 Rust 工程师，负责 Tauri 桌面应用。必须保留 SQLite 兼容性。",
            source("thread-a"),
        );
        let result = build_role_evidence(&facts);
        assert!(result.evidence.complete);
        assert!(!result.evidence.roles.is_empty());
        assert!(!result.evidence.tech_stacks.is_empty());
        assert!(!result.evidence.constraints.is_empty());
    }

    #[test]
    fn records_conflicting_role_facts_without_dropping_either() {
        let facts = vec![
            RoleFact {
                field: "role".to_string(),
                value: "Rust 工程师".to_string(),
                source: source("thread-a"),
            },
            RoleFact {
                field: "role".to_string(),
                value: "产品经理".to_string(),
                source: source("thread-b"),
            },
        ];
        let result = build_role_evidence(&facts);
        assert_eq!(result.evidence.roles.len(), 2);
        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.conflicts[0].code, "PF-CX-009");
    }

    #[test]
    fn skill_block_can_be_removed_without_changing_the_rest() {
        let prompt = "原始提示词正文。";
        let injected = inject_skill_block(
            prompt,
            &["- 使用 `documents` skill 生成 DOCX。".to_string()],
        );
        assert!(injected.contains(SKILL_BLOCK_START));
        assert_eq!(remove_skill_block(&injected), prompt);
    }
}
