# Changelog

## [1.1.0](https://github.com/jmoyers14/landscape/compare/v1.0.0...v1.1.0) (2026-08-07)


### Features

* compute overhead and profit per assembly ([ba16e05](https://github.com/jmoyers14/landscape/commit/ba16e05ba906e82a1a720e119fa3a3a6d164bd48))
* group and total an assembly's tasks in the engine ([77fe205](https://github.com/jmoyers14/landscape/commit/77fe2056cbffc10405231ec35a4d009cc9172913))
* manage and display app version ([b22ffc9](https://github.com/jmoyers14/landscape/commit/b22ffc97bd6366e1d7017a68cfe7b261f294338e))
* show material and labor as separate columns in the editor ([e51a761](https://github.com/jmoyers14/landscape/commit/e51a761de19cf3f8fee34fd25b5735636d6d17cc))
* show overhead and profit per assembly in the estimate editor ([05d4072](https://github.com/jmoyers14/landscape/commit/05d4072047746e500c32c0940bc7acfd0c9e5fef))
* split the cost buildup into material and labor columns ([5a638d9](https://github.com/jmoyers14/landscape/commit/5a638d97578890f942f4fc0db5a4f84ebf09b6cc))
* start new estimates at each assembly's catalog defaults ([d611cff](https://github.com/jmoyers14/landscape/commit/d611cff15a090ca7a6b96f36682fe6da7870408d))
* start new estimates with every active assembly at zero quantity ([122c488](https://github.com/jmoyers14/landscape/commit/122c4881975832391b9a382a62543f9531ad0384))


### Bug Fixes

* align the assembly buildup with the line-item columns ([22786ed](https://github.com/jmoyers14/landscape/commit/22786ed238698199a5d26cda55a8763aa8fcedb3))
* charge no delivery on a zero-quantity material line ([119f480](https://github.com/jmoyers14/landscape/commit/119f480e8f2cc86a37818303d3252cada4f4ad61))
* charge overhead on materials only, matching the bid sheet ([0d0c220](https://github.com/jmoyers14/landscape/commit/0d0c220d36b00154b761343989590661caf39f95))
* collapse LineRow call so Prettier is satisfied ([4164f6f](https://github.com/jmoyers14/landscape/commit/4164f6feee3a1859749a6edb527d7ef38d4a9db0))
* create a new estimate with no line items, not zero-quantity ones ([8d78375](https://github.com/jmoyers14/landscape/commit/8d78375567a452ded81d2624cfdef53a93fea54a))
* prevent numeric columns from wrapping in assembly line-item table ([e611118](https://github.com/jmoyers14/landscape/commit/e611118b26d89211ab9ffb69f7b86e6c3df78b7d))
* render orphan assembly buckets and tidy up review findings ([0939f0a](https://github.com/jmoyers14/landscape/commit/0939f0ad3e2e3341c589ca560c16ad4e5a82ed0e))
* widen the line table so six-column layouts don't wrap ([10397e2](https://github.com/jmoyers14/landscape/commit/10397e2d738552d904c3dc0e2f58c5ef0fbd11cb))


### Reverts

* inline the estimate snapshot generation path ([e0c6bf2](https://github.com/jmoyers14/landscape/commit/e0c6bf2fc9ef6080bd0a3548db1a93827ec81d40))
