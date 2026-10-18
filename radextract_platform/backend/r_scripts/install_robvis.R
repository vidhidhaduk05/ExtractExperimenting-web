# Install robvis from GitHub (mcguinlu/robvis) plus the packages the plot script needs.
# Usage: Rscript r_scripts/install_robvis.R

repos <- "https://cloud.r-project.org"
install.packages(c("jsonlite", "ggplot2", "remotes"), repos = repos)
remotes::install_github("mcguinlu/robvis", upgrade = "never")

if (!requireNamespace("robvis", quietly = TRUE)) {
  stop("robvis did not install")
}
message("robvis ", as.character(utils::packageVersion("robvis")), " is installed")
