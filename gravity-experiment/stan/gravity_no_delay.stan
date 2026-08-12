// Model 1: noisy-time model, no reaction delay
//
//   t_i = sqrt(2 * x_i / g) + e_i,   e_i ~ normal(0, sigma)
//
// Fit the nonlinear mean function directly in g — no linearization,
// no back-transform bias, posterior for g in interpretable units.

data {
  int<lower=1> N;
  vector<lower=0>[N] x;   // drop distances (m)
  vector<lower=0>[N] t;   // observed fall times (s)
}
parameters {
  real<lower=0> g;        // gravitational acceleration (m/s^2)
  real<lower=0> sigma;    // timing noise sd (s)
}
model {
  // Weakly informative priors
  // lognormal keeps g positive with mass roughly on (3, 8).
  g ~ lognormal(log(5), 0.2);
  sigma ~ normal(0, 0.5);
  t ~ normal(sqrt(2 * x / g), sigma);
}
generated quantities {
  // theta = 1 / sqrt(g), the slope from the linearized formulation
  real theta = inv_sqrt(g);

  vector[N] t_rep;
  for (n in 1:N)
    t_rep[n] = normal_rng(sqrt(2 * x[n] / g), sigma);
}
