# box-office-block-builder

Scrapes BoxOfficeMojo for weekend data, generates list of top movies formatted for Slack

## Installation

```bash
npm install
```

## Usage

```bash
node scrape.js
```

## TMDB integration

If you provide a [TMDB API key](https://www.themoviedb.org/settings/api), the script can automatically look up IMDb IDs and poster images using The Movie Database.

1. Create a file named `tmdb-config.json` in the project root (this file is already in `.gitignore`):

   ```json
   {
     "apiKey": "YOUR_TMDB_API_KEY"
   }
   ```

2. Install dependencies (including `moviedb-promise`) with `npm install`.

When `tmdb-config.json` is present and valid, the script will:

- Search TMDB by the scraped movie title and let you choose a match when there are multiple results.
- Use TMDB's `external_ids` endpoint to fill in the IMDb ID.
- Use the movie's `poster_path` as the source image URL (resized for Slack via `images.weserv.nl`).

If TMDB is not configured or a lookup fails, the script falls back to manual prompts for the IMDb ID and image URL.

## Slack emoji

The script uses custom Slack emoji for Rotten Tomatoes scores. To add them to your Slack workspace:

1. Go to **Customize Workspace** > **Emoji** (or visit `https://<your-workspace>.slack.com/customize/emoji`).
2. Click **Add Emoji** and upload each image from the `images/` directory, using the filename (without the `.png` extension) as the emoji name.

### Critics (Tomatometer)

| Status | Icon | Emoji name |
|--------|------|------------|
| Certified Fresh | ![Certified Fresh](images/rotten-tomatoes-certified-fresh.png) | `:rotten-tomatoes-certified-fresh:` |
| Fresh | ![Fresh](images/rotten-tomatoes-fresh-tomato.png) | `:rotten-tomatoes-fresh-tomato:` |
| Rotten | ![Rotten](images/rotten-tomatoes-rotten-splat.png) | `:rotten-tomatoes-rotten-splat:` |
| Not enough reviews | ![Gray Tomato](images/rotten-tomatoes-gray-tomato.png) | `:rotten-tomatoes-gray-tomato:` |

### Audience (Popcornmeter)

| Status | Icon | Emoji name |
|--------|------|------------|
| Verified Hot | ![Verified Hot](images/rotten-tomatoes-verified-hot.png) | `:rotten-tomatoes-verified-hot:` |
| Hot | ![Hot](images/rotten-tomatoes-hot-popcorn.png) | `:rotten-tomatoes-hot-popcorn:` |
| Stale | ![Stale](images/rotten-tomatoes-stale-popcorn.png) | `:rotten-tomatoes-stale-popcorn:` |
| Not enough reviews | ![Gray Popcorn](images/rotten-tomatoes-gray-popcorn.png) | `:rotten-tomatoes-gray-popcorn:` |

## Example output

```plain_text
Getting data from Box Office Mojo: https://www.boxofficemojo.com/weekend/2024W40/
Got data
Got weekend box office winners
Data copied to clipboard
```
