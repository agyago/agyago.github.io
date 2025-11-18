/**
 * Photo List API
 * Returns list of all photos from KV store for gallery display
 */

export async function onRequestGet({ request, env }) {
  try {
    // Determine allowed origin based on request origin
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://www.cheezychinito.com',
      'https://cheezychinito.com',
      'https://agyago.github.io'
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // Get photo list from KV
    const photoListJson = await env.PHOTOS_KV.get('photo-list');

    if (!photoListJson) {
      return new Response(
        JSON.stringify({ photos: [] }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': corsOrigin
          }
        }
      );
    }

    const photoList = JSON.parse(photoListJson);

    // Optionally get metadata for each photo
    const url = new URL(request.url);
    const includeMetadata = url.searchParams.get('metadata') === 'true';

    let photos = photoList;

    if (includeMetadata) {
      // Fetch metadata for all photos (in parallel)
      const photoDataPromises = photoList.map(async (filename) => {
        const photoDataJson = await env.PHOTOS_KV.get(`photo:${filename}`);
        if (photoDataJson) {
          return JSON.parse(photoDataJson);
        }
        return { filename };
      });

      photos = await Promise.all(photoDataPromises);
    }

    return new Response(
      JSON.stringify({
        count: photos.length,
        photos: photos
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          'Access-Control-Allow-Origin': corsOrigin
        }
      }
    );

  } catch (error) {
    console.error('Error fetching photo list:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch photos' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
