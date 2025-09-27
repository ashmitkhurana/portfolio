# portfolio
My Website Portfolio

## Case Study Mock Data Banner

To set expectations while case studies are under active development, a subtle banner appears at the top of every case study page indicating that the data is currently mocked while surveys and validations are in progress.

- Component: `src/components/MockDataBanner.tsx`
- Mounted in: `src/pages/CaseStudyPage.tsx` (right below the `Navbar`).
- Behavior: Dismissible per tab using `sessionStorage`.

Remove later: Delete the `<MockDataBanner />` invocation and import in `CaseStudyPage.tsx`, then delete the component file if not needed.
