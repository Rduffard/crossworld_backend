const getEmailUsername = (email) => {
  if (typeof email !== "string" || !email.includes("@")) {
    return "User";
  }

  const [username] = email.split("@");
  return username || "User";
};

const deriveDisplayName = ({ displayName, profileDisplayName, name, email }) => {
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }

  if (typeof profileDisplayName === "string" && profileDisplayName.trim()) {
    return profileDisplayName.trim();
  }

  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return getEmailUsername(email);
};

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  displayName: deriveDisplayName({
    displayName: user.displayName,
    profileDisplayName: user.settings?.profileDisplayName,
    name: user.name,
    email: user.email,
  }),
  avatar: user.avatar,
  email: user.email,
  settings: {
    profileDisplayName: user.settings?.profileDisplayName ?? "",
    avatarUrl: user.settings?.avatarUrl ?? "",
    theme: user.settings?.theme ?? "default",
    accentColor: user.settings?.accentColor ?? "",
    brandSkin: user.settings?.brandSkin ?? "default",
    emailNotifications: user.settings?.emailNotifications ?? true,
    productUpdates: user.settings?.productUpdates ?? true,
    defaultLandingApp: user.settings?.defaultLandingApp ?? "dashboard",
  },
});

const sanitizeUserSettings = (user) => {
  const sanitizedUser = sanitizeUser(user);

  return {
    displayName: sanitizedUser.displayName,
    settings: sanitizedUser.settings,
  };
};

module.exports = {
  getEmailUsername,
  deriveDisplayName,
  sanitizeUser,
  sanitizeUserSettings,
};
