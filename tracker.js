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

function syncRegionDirectly(region) {
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
    console.log(`Fetched ${episodes.length} episodes for ${region.toUpperCase()}`);
    
    // Sync each episode to Supabase
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      const rank = i + 1; // Array index + 1 = rank position
      
      try {
        const success = upsertEpisodeToSupabase({
          rank: rank,
          episodeName: episode.episodeName,
          showName: episode.showName,
          episodeUri: episode.episodeUri,
          showUri: episode.showUri,
          showDescription: episode.showDescription
        }, region);
        
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error syncing episode ${episode.episodeUri}:`, error);
        errorCount++;
      }
      
      // Small delay to avoid overwhelming Supabase
      if (i % 10 === 0 && i > 0) {
        Utilities.sleep(100);
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
      p_show_description: episode.showDescription || '',
      p_region: region
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
    
    if (response.getResponseCode() !== 200) {
      console.error(`Supabase error for ${episode.episodeUri}: ${response.getContentText()}`);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error(`Error upserting episode ${episode.episodeUri}:`, error);
    return false;
  }
}

// Set up daily trigger for direct sync
function createDailyDirectSyncTrigger() {
  // Delete any existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'dailyPodcastSync') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new daily trigger
  ScriptApp.newTrigger('dailyPodcastSync')
    .timeBased()
    .everyDays(1)
    .atHour(9) // Run at 9 AM daily
    .create();
    
  console.log('Daily direct sync trigger created - will run at 9 AM every day');
}

// Test function to check Supabase connection
function testSupabaseConnection() {
  try {
    const response = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/episodes?select=count&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      console.log('✅ Supabase connection successful!');
      console.log('Response:', response.getContentText());
      return true;
    } else {
      console.error('❌ Supabase connection failed:', response.getContentText());
      return false;
    }
  } catch (error) {
    console.error('❌ Supabase connection error:', error);
    return false;
  }
}

// Test function to check Spotify API
function testSpotifyAPI() {
  try {
    const response = UrlFetchApp.fetch('https://podcastcharts.byspotify.com/api/charts/top_episodes?region=se');
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      console.log('✅ Spotify API connection successful!');
      console.log(`Fetched ${data.length} Swedish episodes`);
      console.log('First episode:', data[0].episodeName);
      return true;
    } else {
      console.error('❌ Spotify API connection failed:', response.getContentText());
      return false;
    }
  } catch (error) {
    console.error('❌ Spotify API connection error:', error);
    return false;
  }
}

// Run all tests
function runAllTests() {
  console.log('=== Running Connection Tests ===');
  
  const spotifyTest = testSpotifyAPI();
  const supabaseTest = testSupabaseConnection();
  
  if (spotifyTest && supabaseTest) {
    console.log('✅ All tests passed! Ready to sync.');
    return true;
  } else {
    console.log('❌ Some tests failed. Check your configuration.');
    return false;
  }
}

// Get stats from Supabase
function getSupabaseStats() {
  try {
    // Get total episodes by region
    const response = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/episodes?select=region,episode_name,score,first_appearance_date&order=score.asc&limit=10`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      console.log('=== Supabase Stats ===');
      console.log(`Total episodes in database: ${data.length > 0 ? 'Data found' : 'No data'}`);
      console.log('Top 10 episodes (lowest scores):');
      data.forEach((episode, index) => {
        console.log(`${index + 1}. [${episode.region.toUpperCase()}] ${episode.episode_name} (Score: ${episode.score})`);
      });
      return data;
    } else {
      console.error('Error fetching stats:', response.getContentText());
      return null;
    }
  } catch (error) {
    console.error('Error getting Supabase stats:', error);
    return null;
  }
}