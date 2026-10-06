# Hackathon submission · Team Daffy Duck · DASH

Everything the Hackathon submission form asks for (Challenge Booklet, Hackathon → Submission), ready to paste.

| Field | Value |
|---|---|
| Repository | https://github.com/vihangasath/DaffyDuck_DASH |
| Deployed system (operations app: dispatcher, loader, driver, store) | https://daffyduck-dash.onrender.com |
| Deployed system (Waypoint People, the HR panel) | https://daffyduck-people.onrender.com |
| Demo video (unlisted, 5:45) | https://youtu.be/NtV_pmNhU5s |

The deployed system runs on Render's free plan: the first visit after about 15 idle minutes takes up to a minute while it wakes. If sign-in returns "Sign-in failed. Please try again.", the backend API is still waking up from sleep—wait ~30–60 seconds and submit again. It is seeded with the public synthetic demo day; see the README's "Datasets and confidentiality".

## Seeded accounts

The password is **`waypoint`** for every account.

**One per user role** (operations app, https://daffyduck-dash.onrender.com):

| Role | Username | Password | Lands on |
|---|---|---|---|
| Dispatcher | `dispatcher` | `waypoint` | Dispatch console, Peliyagoda DC (Kandy hub one click away) |
| Loader | `loader` | `waypoint` | Peliyagoda dock queue (phone app) |
| Driver | `driver` | `waypoint` | Driver app on VEH011 (phone app) |
| Store manager | `store` | `waypoint` | Deliveries for branch OUT007 Rajagiriya |

**HR** (Waypoint People, https://daffyduck-people.onrender.com):

| Role | Username | Password | Lands on |
|---|---|---|---|
| HR officer | `admin` | `waypoint` | Front desk |

**Also seeded** (operations app):

| Username | Who |
|---|---|
| `store-out001` … `store-out120` | Each branch's manager: `store-` plus the branch id in lower case (`store-out010` is OUT010) |
| `loader-kandy` | A Kandy hub loader |
| `driver-kandy` | A Kandy hub driver |

## Paste-ready text for the credentials field

```
Operations app: https://daffyduck-dash.onrender.com
  Dispatcher     dispatcher / waypoint
  Loader         loader / waypoint      (phone-sized screen)
  Driver         driver / waypoint      (phone-sized screen)
  Store manager  store / waypoint
HR panel (Waypoint People): https://daffyduck-people.onrender.com
  HR officer     admin / waypoint
Every branch manager: store-out001 ... store-out120 / waypoint
Judge walkthrough: README → Judge walkthrough
```
