// ===== DIRECT SPOTIFY API TO SUPABASE SYNC =====
// Google Apps Script - No Google Sheets needed!

// Supabase configuration
const SUPABASE_URL = 'https://imcshkfuhcjpvmzyflso.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // Replace with your service_role key

function dailyPodcastSync() {
  console.log('=== Starting direct Spotify to Supabase sync ===');
  
  try {
    // Sync both regions
    const swedenResult = syncRegionDirectly('se');
    const usResult = syncRegionDirectly('us');
    
    console.log('=== Sync Summary ===');
    console.log(`Sweden: ${swedenResult.success ? 'SUCCESS' : 'FAILED'} - ${swedenResult.success ? swedenResult.episodeCount + ' episodes' : swedenResult.error}`);
    console.log(`US: ${usResult.success ? 'SUCCESS' : 'FAILED'} - ${usResult.success ? usResult.episodeCount + ' episodes' : usResult.error}`);
    
    return {
      sweden: swedenResult,
      us: usResult,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('Error in dailyPodcastSync:', error);
    return { success: false, error: error.message };
  }
}

function syncRegionDirectly(region, limit = null) {
  const urls = {
    'se': 'https://podcastcharts.byspotify.com/api/charts/top_episodes?region=se',
    'us': 'https://podcastcharts.byspotify.com/api/charts/top_episodes?region=us'
  };
  
  try {
    console.log(`Fetching ${region.toUpperCase()} podcast data from Spotify...`);
    
    // Fetch data from Spotify API
    const response = UrlFetchApp.fetch(urls[region]);
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`Spotify API error: ${response.getResponseCode()}`);
    }
    
    const episodes = JSON.parse(response.getContentText());
    
    // Apply limit if specified (for testing)
    const episodesToProcess = limit ? episodes.slice(0, limit) : episodes;
    console.log(`Fetched ${episodes.length} episodes for ${region.toUpperCase()}${limit ? ` (processing first ${limit})` : ''}`);
    
    // Sync each episode to Supabase
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < episodesToProcess.length; i++) {
              const episode = episodesToProcess[i];
        const rank = i + 1; // Array index + 1 = rank position
        
        try {
          // Convert episode URI to Spotify URL and fetch episode details
          const episodeUrl = convertSpotifyUriToUrl(episode.episodeUri);
          console.log(`Fetching details for episode ${i + 1}/${episodesToProcess.length}: ${episode.episodeName}`);
        
        // Add delay before each Spotify request to avoid 403 errors
        if (i > 0) {
          Utilities.sleep(200); // 200ms delay between requests
        }
        
        const episodeDetails = extractSpotifyEpisodeInfo(episodeUrl);
        
        const success = upsertEpisodeToSupabase({
          rank: rank,
          episodeName: episode.episodeName,
          showName: episode.showName,
          episodeUri: episode.episodeUri,
          showUri: episode.showUri,
          showDescription: episode.showDescription,
          episodeDescription: episodeDetails.success ? episodeDetails.description : null,
          episodeDuration: episodeDetails.success ? episodeDetails.duration : null
        }, region);
        
        if (success) {
          successCount++;
          console.log(`✓ Episode ${i + 1} synced successfully`);
        } else {
          errorCount++;
          console.log(`✗ Episode ${i + 1} sync failed`);
        }
      } catch (error) {
        console.error(`Error syncing episode ${episode.episodeUri}:`, error);
        errorCount++;
      }
      
              // Small delay to avoid overwhelming both Spotify and Supabase
        if (i % 5 === 0 && i > 0) {
          console.log(`Processed ${i} episodes, pausing briefly...`);
          Utilities.sleep(1000); // Longer pause every 5 episodes
        }
    }
    
    console.log(`${region.toUpperCase()} sync completed: ${successCount} success, ${errorCount} errors`);
    
    return {
      success: errorCount === 0,
      episodeCount: successCount,
      errors: errorCount,
      region: region.toUpperCase()
    };
    
  } catch (error) {
    console.error(`Error syncing ${region.toUpperCase()}:`, error);
    return { 
      success: false, 
      error: error.message, 
      region: region.toUpperCase() 
    };
  }
}

function upsertEpisodeToSupabase(episode, region) {
  try {
    // Prepare the payload for the upsert function
    const payload = {
      p_episode_uri: episode.episodeUri,
      p_rank: episode.rank,
      p_episode_name: episode.episodeName,
      p_show_name: episode.showName,
      p_show_uri: episode.showUri,
      p_region: region,
      p_show_description: episode.showDescription || '',
      p_episode_description: episode.episodeDescription || null,
      p_episode_duration: episode.episodeDuration || null
    };
    
    // Call Supabase RPC function
    const response = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_episode_score`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    });
    
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // Supabase RPC calls can return 200 or 204 for success
    if (statusCode === 200 || statusCode === 204) {
      return true;
    } else {
      console.error(`Supabase error for ${episode.episodeUri}:`);
      console.error(`Status Code: ${statusCode}`);
      console.error(`Response: ${responseText}`);
      console.error(`Payload sent:`, JSON.stringify(payload, null, 2));
      return false;
    }
    
  } catch (error) {
    console.error(`Error upserting episode ${episode.episodeUri}:`, error);
    console.error(`Error details:`, error.toString());
    return false;
  }
}

function testPodcastSync() {
  console.log('=== Starting TEST sync (first 15 episodes) ===');
  
  try {
    // Test sync with first 15 episodes from both regions
    const swedenResult = syncRegionDirectly('se', 15);
    const usResult = syncRegionDirectly('us', 15);
    
    console.log('=== TEST Sync Summary ===');
    console.log(`Sweden (15): ${swedenResult.success ? 'SUCCESS' : 'FAILED'} - ${swedenResult.success ? swedenResult.episodeCount + ' episodes' : swedenResult.error}`);
    console.log(`US (15): ${usResult.success ? 'SUCCESS' : 'FAILED'} - ${usResult.success ? usResult.episodeCount + ' episodes' : usResult.error}`);
    
    return {
      sweden: swedenResult,
      us: usResult,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('Error in testPodcastSync:', error);
    return { success: false, error: error.message };
  }
}

function convertSpotifyUriToUrl(uri) {
  // Convert spotify:episode:ID to https://open.spotify.com/episode/ID
  try {
    const episodeId = uri.split(':')[2];
    return `https://open.spotify.com/episode/${episodeId}`;
  } catch (error) {
    console.error(`Error converting URI ${uri}:`, error);
    return null;
  }
}

function testExtractSpotifyEpisodeInfo() {
  // Test with the provided episode URL
  const url = "https://open.spotify.com/episode/5XfNm9dJmcqD9tlEjLuRil";
  const info = extractSpotifyEpisodeInfo(url);
  console.log("Extracted info:", info);
  return info;
}

function extractSpotifyEpisodeInfo(episodeUrl, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    if (!episodeUrl) {
      return { success: false, error: 'No URL provided' };
    }
    
    // Fetch the HTML content with timeout and error handling
    const response = UrlFetchApp.fetch(episodeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      muteHttpExceptions: true // Don't throw exceptions for HTTP errors
    });
    
    const statusCode = response.getResponseCode();
    
    // Handle 403 errors with retry mechanism
    if (statusCode === 403 && retryCount < maxRetries) {
      const retryDelay = (retryCount + 1) * 1000; // 1s, 2s, 3s delays
      console.warn(`403 error for ${episodeUrl}, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      Utilities.sleep(retryDelay);
      return extractSpotifyEpisodeInfo(episodeUrl, retryCount + 1);
    }
    
    if (statusCode !== 200) {
      console.warn(`Failed to fetch ${episodeUrl}: HTTP ${statusCode}${retryCount > 0 ? ` (after ${retryCount} retries)` : ''}`);
      return { 
        success: false, 
        error: `HTTP ${statusCode}`,
        url: episodeUrl 
      };
    }
    
    const html = response.getContentText();
    
    // Extract raw HTML for the meta description tag
    const metaDescriptionMatch = html.match(/<meta name="description"[^>]*>/i);
    const rawMetaDescription = metaDescriptionMatch ? metaDescriptionMatch[0] : null;
    
    // Extract raw HTML for the episode progress element
    const episodeProgressMatch = html.match(/<p[^>]*data-testid="episode-progress-not-played"[^>]*>.*?<\/p>/i);
    const rawEpisodeProgress = episodeProgressMatch ? episodeProgressMatch[0] : null;
    
    // Debug logging (uncomment for troubleshooting)
    // console.log("=== RAW HTML EXTRACTION ===");
    // console.log("Meta Description Tag:", rawMetaDescription);
    // console.log("Episode Progress Element:", rawEpisodeProgress);
    
    // Extract and clean the data
    let description = null;
    let duration = null;
    
    if (rawMetaDescription) {
      const contentMatch = rawMetaDescription.match(/content="([^"]*)"/i);
      if (contentMatch) {
        let rawDescription = contentMatch[1];
        
        // Remove the boilerplate "Listen to this episode from [SHOW] on Spotify." text
        // This regex matches the pattern and removes it, keeping only the actual description
        const cleanedDescription = rawDescription.replace(/^Listen to this episode from .+ on Spotify\.\s*/i, '');
        
        // Also handle HTML entities like &quot;
        description = cleanedDescription
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .trim();
        
        // If the description is empty after cleaning, set to null
        if (!description || description.length === 0) {
          description = null;
        }
      }
    }
    
    if (rawEpisodeProgress) {
      const durationMatch = rawEpisodeProgress.match(/>([^<]*)<\/span><\/p>/);
      duration = durationMatch ? durationMatch[1].trim() : null;
    }
    
    return {
      success: true,
      description: description,
      duration: duration,
      url: episodeUrl
    };
    
  } catch (error) {
    console.error(`Error extracting episode info from ${episodeUrl}:`, error);
    return {
      success: false,
      error: error.message,
      url: episodeUrl
    };
  }
}