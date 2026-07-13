fn main() {
    std::process::exit(usagebar_lib::cli::run(std::env::args().skip(1)));
}
