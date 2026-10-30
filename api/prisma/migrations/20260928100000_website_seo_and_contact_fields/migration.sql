-- AlterTable
ALTER TABLE `ContactMessage` ADD COLUMN `consent` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ipAddress` VARCHAR(64) NULL,
    ADD COLUMN `pageUrl` VARCHAR(500) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL,
    MODIFY `message` TEXT NULL;

-- CreateTable
CREATE TABLE `SeoPage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `pageName` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `keywords` TEXT NULL,
    `ogTitle` VARCHAR(255) NULL,
    `ogDescription` TEXT NULL,
    `ogImage` VARCHAR(500) NULL,
    `canonicalUrl` VARCHAR(500) NULL,
    `noindex` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SeoPage_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ContactMessage_source_idx` ON `ContactMessage`(`source`);

-- CreateIndex
CREATE INDEX `ContactMessage_ipAddress_createdAt_idx` ON `ContactMessage`(`ipAddress`, `createdAt`);

-- Seed: current SEO of each website page (editable from the admin panel)
INSERT IGNORE INTO `SeoPage` (`slug`, `pageName`, `path`, `title`, `description`, `keywords`, `updatedAt`) VALUES
('index', 'Home', '/',
 'Managed Farmland near Bangalore | Mount Quintaa',
 'For buying the best managed farmland near Bangalore. Mount Quintaa offers registered farmland for sale starting from Rs. 499 / Sq. Ft.',
 'managed farmland near Bangalore, farmland for sale near Bangalore, registered farmland, farm plots near Bangalore, managed farm plots, farm plots near Hosur, farm plots in Shoolagiri, gated farm community, weekend farm plots, farmland investment, farm plots near Electronic City, buy farm land near Bangalore, mango farm plots', CURRENT_TIMESTAMP(3)),
('about', 'About Us', '/about',
 'About Mount Quintaa | Managed Farmland Near Hosur & Shoolagiri, Tamil Nadu',
 'The story, mission and people behind Mount Quintaa — a gated managed farmland community near Veppanapalli on the Bengaluru–Hosur–Shoolagiri corridor, Tamil Nadu.',
 NULL, CURRENT_TIMESTAMP(3)),
('projects', 'Projects', '/projects',
 'Farm Plots for Sale Near Hosur & Shoolagiri | Quintaa Greens | Mount Quintaa',
 'Quintaa Greens: gated managed farm plots from 5,445 sq ft near Veppanapalli on the Hosur–Shoolagiri corridor, Tamil Nadu — clubhouse, mango plantations, drip irrigation and clear titles.',
 NULL, CURRENT_TIMESTAMP(3)),
('contact', 'Contact', '/contact',
 'Book a Site Visit | Farm Plots Near Bangalore & Hosur | Mount Quintaa',
 'Book a site visit or talk to the Mount Quintaa team about managed farm plots near Bangalore — Veppanapalli, Hosur–Shoolagiri corridor, Tamil Nadu 635121.',
 NULL, CURRENT_TIMESTAMP(3)),
('privacy', 'Privacy Policy', '/privacy',
 'Privacy Policy | Mount Quintaa',
 'Mount Quintaa''s Privacy Policy — how we collect, use, store and protect your personal information when you visit mountquintaa.com or enquire about our managed farm plots.',
 NULL, CURRENT_TIMESTAMP(3)),
('blogs', 'Blog (home)', '/blogs/',
 'Farmland Investment Blog | Farm Plots Near Bangalore & Hosur | Mount Quintaa',
 'The Mount Quintaa Journal — guides on managed farmland investment, buying farm plots near Bangalore, Hosur and Shoolagiri, weekend farm living and clear-title land buying in Tamil Nadu.',
 'farmland investment, managed farmland near Bangalore, farm plots near Hosur, Shoolagiri farm plots, buy farm land near Bangalore, weekend farm plots, agricultural investment', CURRENT_TIMESTAMP(3));
