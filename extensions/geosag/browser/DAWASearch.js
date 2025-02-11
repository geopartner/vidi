/*
 * @author     René Giovanni Borella
 * @copyright  2020 Geopartner A/S
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

import React from "react";
import debounce from "lodash.debounce";
import throttle from "lodash.throttle";

function uniqBy(a, key) {
  var seen = {};
  return a.filter(function (item) {
    var k = key(item);
    return seen.hasOwnProperty(k) ? false : (seen[k] = true);
  });
}

class DAWASearch extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchTerm: "",
      searchResults: [],
      resultsPerSource:
        props.resultsPerSource === undefined
          ? 3
          : parseInt(props.resultsPerSource),
      resultsMax:
        props.resultsMax === undefined ? 10 : parseInt(props.resultsMax),
      resultsKeepOpen:
        props.resultsKeepOpen === undefined ? false : props.resultsKeepOpen,
      fuzzy: props.fuzzy === undefined ? true : props.fuzzy,
      srid: props.srid === undefined ? 25832 : parseInt(props.srid),
      nocache: props.nocache === undefined ? false : props.nocache,
      enableAdresse:
        props.enableAdresse === undefined ? true : props.enableAdresse,
      enableMatrikel:
        props.enableMatrikel === undefined ? true : props.enableMatrikel,
      enableBFE: props.enableBFE === undefined ? true : props.enableBFE,
      //enableSFE: props.enableSFE === undefined ? true : props.enableSFE,
      enableSFE: props.enableSFE === false,
      placeholder: this.buildPlaceholder(),
      triggerAtChar:
        props.triggerAtChar === undefined ? 0 : parseInt(props.triggerAtChar),
      loading: false,
    };

    this.autocompleteSearchDebounced = debounce(this.autocompleteSearch, 800);
    this.autocompleteSearchThrottled = throttle(this.autocompleteSearch, 1200);
    this.escFunction = this.escFunction.bind(this);
  }

  componentDidMount() {
    document.addEventListener("keydown", this.escFunction, false);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.escFunction, false);
  }

  escFunction(event) {
    if (event.keyCode === 27) {
      this.clear();
    }
  }

  clear() {
    this.setState({ searchResults: [], searchTerm: "" });
  }

  buildPlaceholder() {
    return "Adresse, matr.nr eller BFE nr.";
  }

  _handleResult = (id) => {
    if (!this.state.resultsKeepOpen) {
      this.setState({
        searchResults: [],
        searchTerm: "",
      });
    }
    this.props._handleResult(id);
  };

  dynamicSearch = (event) => {
    var term = event.target.value;
    this.setState(
      {
        searchTerm: term,
      },
      () => {
        const q = this.state.searchTerm;
        if (q.length < this.state.triggerAtChar) {
          this.autocompleteSearchThrottled(this.state.searchTerm);
        } else {
          this.autocompleteSearchDebounced(this.state.searchTerm);
        }
      }
    );
  };

  autocompleteSearch = (q) => {
    this._fetch(q);
  };

  _fetch = (q) => {
    var _self = this;
    var s = _self.state;
    var term = s.searchTerm;
    // run promises here to return stuff from somewhere
    var calls = [];

    //set loading
    this.setState({
      loading: true,
    });

    // Anything
    if (s.enableAdresse) {
      calls.push(this.callDawa("adresser", term));
    }
    if (s.enableMatrikel) {
      calls.push(this.callDawa("jordstykker", term));
    }

    // only integers
    if (!isNaN(parseInt(term))) {
      if (s.enableESR) {
        calls.push(this.callDawa("jordstykker", term, "udvidet_esrejendomsnr"));
      }
      if (s.enableBFE) {
        calls.push(this.callDawa("jordstykker", term, "bfenummer"));
      }
      if (s.enableSFE) {
        calls.push(this.callDawa("jordstykker", term, "sfeejendomsnr"));
      }
    }

    this.waitingFor = term;
    //console.log(this.waitingFor)

    // Call the stuff
    Promise.all(calls)
      .then((r) => {
        var results = r;

        // Merge all the things
        try {
          var all = results.flat(1);
          var cleaned = [];

          // Dont bring errors
          all.forEach((obj) => {
            if (obj.hasOwnProperty("tekst")) {
              cleaned.push(obj);
            }
          });
          //console.log(cleaned);
          //Only do something with the term we're expecting
          //console.log(term)
          if (term === this.waitingFor) {
            _self.setState({
              loading: false,
              searchTerm: term,
              searchResults: uniqBy(cleaned, JSON.stringify).slice(
                0,
                s.resultsMax
              ),
            });

            // focus on the search input
            if (document.getElementById("searchInput")) {
              document.getElementById("searchInput").focus();
            }
          }
        } catch (e) {
          _self.setState({
            error: e.toString(),
          });
        }
      })
      .catch((err) => {
        _self.setState({
          error: e.toString(),
        });
      });
  };

  callDawa = (service, term, specific = undefined) => {
    var s = this.state;
    var hostName = "/api/datahub/" + service + "/autocomplete?";
    //var hostName = "https://dawa.aws.dk/" + service + "/autocomplete?";
    var params = {};

    params.per_side = s.resultsPerSource;
    params.side = 1;
    params.srid = s.srid;

    if (s.nocache) {
      params.cache = "no-cache";
    }

    // Pinpointing
    if (specific) {
      switch (specific) {
        case "bfenummer":
          params.bfenummer = term;
          break;
        case "esrejendomsnr":
          params.udvidet_esrejendomsnr = term;
          break;
        case "sfeejendomsnr":
          params.sfeejendomsnr = term;
          break;
      }
    } else {
      params.q = term;
    }

    // Get ready to rumble
    //console.log(hostName + new URLSearchParams(params));

    return new Promise(function (resolve, reject) {
      fetch(hostName + new URLSearchParams(params))
        .then((r) => r.json())
        .then((d) => {
          resolve(d);
        })
        .catch((e) => reject(e));
    });
  };

  render() {
    var s = this.state;

    return (
      <div className="d-flex col-12 mx-auto position-relative">
        <div className="input-group">
          <input
            type="text"
            id="searchInput"
            className="form-control"
            placeholder={s.placeholder}
            value={s.searchTerm}
            onChange={this.dynamicSearch}
            disabled={s.loading}
          />
          {s.searchTerm.length > 0 && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={this.clear.bind(this)}
            >
              <i className="bi bi-x"></i>
            </button>
          )}
        </div>
        {s.searchResults.length > 0 && (
          <ResultsList
            results={s.searchResults}
            _handleResult={this._handleResult}
            q={s.searchTerm}
            t={s.triggerAtChar}
          />
        )}
      </div>
    );
  }
}

class ResultsList extends React.Component {
  _handleResult = (id) => {
    this.props._handleResult(id);
  };

  render() {
    if (this.props.results.length > 0) {
      return (
        <div className="list-group position-absolute w-100 mt-3 pt-4">
          {this.props.results.map((r, index) => (
            <button
              key={index}
              className="list-group-item list-group-item-action"
              onClick={() => this._handleResult(r)}
            >
              {r.tekst}
            </button>
          ))}
        </div>
      );
    } else {
      return null;
    }
  }
}

export default DAWASearch;
