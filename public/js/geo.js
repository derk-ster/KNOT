// States and their major cities, so a profile can offer a state first and then a city. Anything not
// listed can still be typed in; the city box is free text.
export const US_PLACES = {
  AL: 'Birmingham, Montgomery, Huntsville, Mobile',
  AK: 'Anchorage, Fairbanks, Juneau',
  AZ: 'Phoenix, Tucson, Mesa, Scottsdale, Flagstaff',
  AR: 'Little Rock, Fayetteville, Fort Smith',
  CA: 'Los Angeles, San Diego, San Francisco, San Jose, Sacramento, Fresno, Long Beach, Oakland',
  CO: 'Denver, Colorado Springs, Boulder, Fort Collins, Aurora',
  CT: 'Hartford, New Haven, Stamford, Bridgeport',
  DE: 'Wilmington, Dover, Newark',
  DC: 'Washington',
  FL: 'Miami, Orlando, Tampa, Jacksonville, Tallahassee, Fort Lauderdale, St. Petersburg',
  GA: 'Atlanta, Savannah, Athens, Augusta, Columbus',
  HI: 'Honolulu, Hilo, Kailua',
  ID: 'Boise, Meridian, Idaho Falls',
  IL: 'Chicago, Springfield, Naperville, Peoria, Evanston',
  IN: 'Indianapolis, Fort Wayne, Bloomington, South Bend',
  IA: 'Des Moines, Cedar Rapids, Iowa City',
  KS: 'Wichita, Kansas City, Topeka, Lawrence',
  KY: 'Louisville, Lexington, Bowling Green',
  LA: 'New Orleans, Baton Rouge, Shreveport, Lafayette',
  ME: 'Portland, Bangor, Augusta',
  MD: 'Baltimore, Annapolis, Frederick, Rockville',
  MA: 'Boston, Cambridge, Worcester, Springfield, Somerville',
  MI: 'Detroit, Ann Arbor, Grand Rapids, Lansing',
  MN: 'Minneapolis, Saint Paul, Duluth, Rochester',
  MS: 'Jackson, Gulfport, Oxford',
  MO: 'Kansas City, Saint Louis, Springfield, Columbia',
  MT: 'Billings, Missoula, Bozeman',
  NE: 'Omaha, Lincoln, Grand Island',
  NV: 'Las Vegas, Reno, Henderson, Carson City',
  NH: 'Manchester, Concord, Nashua',
  NJ: 'Newark, Jersey City, Trenton, Princeton',
  NM: 'Albuquerque, Santa Fe, Las Cruces',
  NY: 'New York, Buffalo, Rochester, Albany, Syracuse, Brooklyn, Queens',
  NC: 'Charlotte, Raleigh, Durham, Greensboro, Asheville',
  ND: 'Fargo, Bismarck, Grand Forks',
  OH: 'Columbus, Cleveland, Cincinnati, Dayton, Toledo',
  OK: 'Oklahoma City, Tulsa, Norman',
  OR: 'Portland, Eugene, Salem, Bend',
  PA: 'Philadelphia, Pittsburgh, Harrisburg, Allentown',
  RI: 'Providence, Warwick, Newport',
  SC: 'Charleston, Columbia, Greenville',
  SD: 'Sioux Falls, Rapid City, Pierre',
  TN: 'Nashville, Memphis, Knoxville, Chattanooga',
  TX: 'Houston, Dallas, Austin, San Antonio, Fort Worth, Plano, Frisco, Richardson, Allen, McKinney, Irving, Garland, El Paso',
  UT: 'Salt Lake City, Provo, Ogden, Park City',
  VT: 'Burlington, Montpelier, Rutland',
  VA: 'Richmond, Virginia Beach, Arlington, Norfolk, Alexandria',
  WA: 'Seattle, Spokane, Tacoma, Bellevue, Olympia',
  WV: 'Charleston, Morgantown, Huntington',
  WI: 'Milwaukee, Madison, Green Bay',
  WY: 'Cheyenne, Casper, Jackson'
};
export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
export const placesIn = code => (code
  ? (US_PLACES[code] || '').split(',').map(s => s.trim()).filter(Boolean)
  : [...new Set(Object.values(US_PLACES).join(',').split(',').map(s => s.trim()).filter(Boolean))]);
export const stateOf = city => Object.keys(US_PLACES).find(k => placesIn(k).some(c => c.toLowerCase() === String(city || '').toLowerCase())) || '';
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
