(() => {
  function extractSteamIdFromProfileHtml(html) {
    if (!html) return '';

    const profileDataMatch = html.match(/g_rgProfileData\s*=\s*(\{.*?\});/s);
    if (profileDataMatch?.[1]) {
      try {
        const profileData = JSON.parse(profileDataMatch[1]);
        if (profileData?.steamid) {
          return profileData.steamid;
        }
      } catch (error) {
        console.warn('Failed to parse Steam profile data JSON:', error);
      }
    }

    const profileUrlMatches = html.matchAll(
      /steamcommunity\.com\/profiles\/(\d+)/g,
    );
    for (const match of profileUrlMatches) {
      if (match?.[1]) {
        return match[1];
      }
    }

    return '';
  }

  const api = {
    extractSteamIdFromProfileHtml,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotSteamCommunity = api;
})();
