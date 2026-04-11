const AchievementDefinition = require("./definitions/model");
const UserAchievement = require("./userAchievements/model");

const NotFoundError = require("../../core/errors/not-found-error");

const buildDefinitionQuery = ({
  sourceApp,
  category,
  includeHidden = false,
  activeOnly = true,
} = {}) => {
  const query = {};

  if (activeOnly) {
    query.active = true;
  }

  if (!includeHidden) {
    query.hidden = false;
  }

  if (sourceApp) {
    query.sourceApp = String(sourceApp).trim().toLowerCase();
  }

  if (category) {
    query.category = String(category).trim().toLowerCase();
  }

  return query;
};

const getProgressTarget = (definition) => {
  const target = Number(definition?.requirementConfig?.target);

  if (Number.isFinite(target) && target >= 1) {
    return Math.floor(target);
  }

  return 1;
};

const serializeAchievement = (definition, userAchievement) => ({
  key: definition.key,
  title: definition.title,
  description: definition.description,
  sourceApp: definition.sourceApp,
  category: definition.category,
  points: definition.points,
  icon: definition.icon,
  hidden: definition.hidden,
  repeatable: definition.repeatable,
  requirementType: definition.requirementType,
  requirementConfig: definition.requirementConfig,
  active: definition.active,
  unlocked: userAchievement?.unlocked ?? false,
  unlockedAt: userAchievement?.unlockedAt ?? null,
  progress: userAchievement?.progress ?? 0,
  progressTarget: userAchievement?.progressTarget ?? getProgressTarget(definition),
  seen: userAchievement?.seen ?? false,
  lastAwardedAt: userAchievement?.lastAwardedAt ?? null,
  sourceContext: userAchievement?.sourceContext ?? null,
});

const listAchievementDefinitions = async (filters = {}) =>
  AchievementDefinition.find(buildDefinitionQuery(filters))
    .sort({ sourceApp: 1, category: 1, points: -1, title: 1 })
    .lean();

const getAchievementDefinition = async (achievementKey, options = {}) => {
  const definition = await AchievementDefinition.findOne({
    key: String(achievementKey).trim().toLowerCase(),
    ...buildDefinitionQuery(options),
  }).lean();

  if (!definition) {
    throw new NotFoundError("Achievement not found");
  }

  return definition;
};

const getUserAchievements = async (userId, filters = {}) => {
  const definitions = await listAchievementDefinitions(filters);

  if (!definitions.length) {
    return [];
  }

  const userAchievements = await UserAchievement.find({
    userId,
    achievementKey: {
      $in: definitions.map((definition) => definition.key),
    },
  }).lean();

  const userAchievementMap = new Map(
    userAchievements.map((achievement) => [achievement.achievementKey, achievement])
  );

  let mergedAchievements = definitions.map((definition) =>
    serializeAchievement(definition, userAchievementMap.get(definition.key))
  );

  if (typeof filters.unlocked === "boolean") {
    mergedAchievements = mergedAchievements.filter(
      (achievement) => achievement.unlocked === filters.unlocked
    );
  }

  return mergedAchievements;
};

const getUserAchievementSummary = async (userId, filters = {}) => {
  const achievements = await getUserAchievements(userId, filters);

  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const totalPoints = unlocked.reduce(
    (sum, achievement) => sum + (achievement.points || 0),
    0
  );

  return {
    total: achievements.length,
    unlocked: unlocked.length,
    locked: achievements.length - unlocked.length,
    totalPoints,
    completionPercentage:
      achievements.length === 0
        ? 0
        : Math.round((unlocked.length / achievements.length) * 100),
    bySourceApp: achievements.reduce((summary, achievement) => {
      const sourceApp = achievement.sourceApp || "global";

      if (!summary[sourceApp]) {
        summary[sourceApp] = {
          total: 0,
          unlocked: 0,
          totalPoints: 0,
        };
      }

      summary[sourceApp].total += 1;

      if (achievement.unlocked) {
        summary[sourceApp].unlocked += 1;
        summary[sourceApp].totalPoints += achievement.points || 0;
      }

      return summary;
    }, {}),
  };
};

const awardAchievement = async (userId, achievementKey, sourceContext = null) => {
  const definition = await getAchievementDefinition(achievementKey, {
    includeHidden: true,
  });
  const now = new Date();
  const progressTarget = getProgressTarget(definition);

  return UserAchievement.findOneAndUpdate(
    {
      userId,
      achievementKey: definition.key,
    },
    {
      $setOnInsert: {
        userId,
        achievementKey: definition.key,
      },
      $set: {
        sourceApp: definition.sourceApp,
        unlocked: true,
        unlockedAt: now,
        progress: progressTarget,
        progressTarget,
        seen: false,
        lastAwardedAt: now,
        sourceContext,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  ).lean();
};

const incrementAchievementProgress = async (
  userId,
  achievementKey,
  amount = 1,
  sourceContext = null
) => {
  const definition = await getAchievementDefinition(achievementKey, {
    includeHidden: true,
  });
  const existing = await UserAchievement.findOne({
    userId,
    achievementKey: definition.key,
  }).lean();
  const progressTarget = getProgressTarget(definition);
  const nextProgress = Math.min(
    Math.max((existing?.progress ?? 0) + Math.max(Number(amount) || 0, 0), 0),
    progressTarget
  );
  const unlocked = existing?.unlocked || nextProgress >= progressTarget;
  const now = new Date();

  return UserAchievement.findOneAndUpdate(
    {
      userId,
      achievementKey: definition.key,
    },
    {
      $setOnInsert: {
        userId,
        achievementKey: definition.key,
      },
      $set: {
        sourceApp: definition.sourceApp,
        progress: nextProgress,
        progressTarget,
        unlocked,
        unlockedAt: unlocked ? existing?.unlockedAt ?? now : null,
        seen: false,
        lastAwardedAt: unlocked ? now : existing?.lastAwardedAt ?? null,
        sourceContext,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  ).lean();
};

module.exports = {
  listAchievementDefinitions,
  getAchievementDefinition,
  getUserAchievements,
  getUserAchievementSummary,
  awardAchievement,
  incrementAchievementProgress,
};
