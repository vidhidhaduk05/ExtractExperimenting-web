import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, useLocation} from 'react-router-dom';
import '../../src/index.css';
import {LandingPage} from '../../src/pages/LandingPage';
function Check(){const location=useLocation();return location.pathname==='/'?<LandingPage/>:<output data-testid="navigation">{location.pathname+location.search}</output>}
createRoot(document.getElementById('root')!).render(<MemoryRouter><Check/></MemoryRouter>);
