# Published campaigns

Place exported campaign JSON files here, for example `first-campaign/campaign.json`.
Add their paths (relative to this directory) to `index.json`:

```json
{
  "version": 1,
  "campaigns": ["first-campaign/campaign.json"]
}
```

The export includes all missions. Images uploaded in Author Studio are embedded
in the JSON and need no separate files. For external image files, use
`public/images/campaigns/first-campaign/` and set image fields in the JSON to
`/images/campaigns/first-campaign/intro.jpg` etc.

See `docs/KAMPAGNEN.md` for the full instructions. The catalogue starts empty;
add your actual exported campaign rather than placeholder mission data.
