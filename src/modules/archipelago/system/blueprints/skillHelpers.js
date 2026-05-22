const expandedSkillList = require("./skills");

const skillCategories = Object.keys(expandedSkillList);

function createEmptySkillState() {
  return skillCategories.reduce((skills, categoryKey) => {
    skills[categoryKey] = [];
    return skills;
  }, {});
}

function createSkillCatalog() {
  return Object.entries(expandedSkillList).reduce((catalog, [categoryKey, categorySkills]) => {
    categorySkills.forEach((skill) => {
      catalog[skill.id] = {
        ...skill,
        categoryKey,
      };
    });

    return catalog;
  }, {});
}

function getSavedSkillEntries(skills = {}) {
  if (Array.isArray(skills)) {
    return skills.map((skill) => ({
      categoryKey: skill.categoryKey ?? skill.category ?? "",
      skill,
    }));
  }

  return Object.entries(skills ?? {}).flatMap(([categoryKey, entries]) =>
    (entries ?? []).map((skill) => ({
      categoryKey,
      skill,
    }))
  );
}

function normalizeSkillRank(rank) {
  return Math.max(0, Math.min(5, Number(rank) || 0));
}

function normalizeCharacterSkills(skills = {}) {
  const normalizedSkills = createEmptySkillState();
  const skillCatalog = createSkillCatalog();

  getSavedSkillEntries(skills).forEach(({ categoryKey, skill }) => {
    const catalogSkill = skillCatalog[skill.id];
    const resolvedCategoryKey = catalogSkill?.categoryKey ?? categoryKey;

    if (!catalogSkill || !normalizedSkills[resolvedCategoryKey]) {
      return;
    }

    const rank = normalizeSkillRank(skill.rank);

    if (rank <= 0) {
      return;
    }

    normalizedSkills[resolvedCategoryKey].push({
      id: catalogSkill.id,
      rank,
      specialty: skill.specialty ?? "",
    });
  });

  Object.keys(normalizedSkills).forEach((categoryKey) => {
    normalizedSkills[categoryKey].sort((left, right) => {
      const leftSkill = skillCatalog[left.id];
      const rightSkill = skillCatalog[right.id];

      return (leftSkill?.name ?? left.id).localeCompare(rightSkill?.name ?? right.id);
    });
  });

  return normalizedSkills;
}

module.exports = {
  createEmptySkillState,
  expandedSkillList,
  normalizeCharacterSkills,
  skillCategories,
};
